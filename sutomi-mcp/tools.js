// The MCP server: sutomi's tasklists as tools. Each tool returns a spoken-friendly text line plus
// structuredContent matching its outputSchema, so both a voice script and an LLM client can use it.
//
// Idempotent writes: `add_task` takes a `request_key`; the item's id is derived from it, and sutomi
// ignores an add whose id already exists, so repeating a request after a dropped connection returns
// the original item instead of a duplicate.
import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { createHash, randomBytes } from 'crypto'

const HIDE_DONE_AFTER_MS = 24 * 60 * 60 * 1000 // same rule as sutomi's tasklists page

export const itemIdFor = (requestKey) => createHash('sha256').update(String(requestKey)).digest('hex').slice(0, 12)
const randomId = () => randomBytes(6).toString('hex')

const Item = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
  parked: z.boolean(),
  priority: z.enum(['low', 'medium', 'high']),
  created_at: z.string().describe('ISO 8601'),
})
const ListSummary = z.object({ id: z.string(), name: z.string(), open: z.number().int(), parked: z.number().int() })

const toItem = (it) => ({
  id: it.id, text: it.text, done: Boolean(it.done), parked: Boolean(it.parked),
  priority: it.priority || 'low', created_at: new Date(it.createdAt || 0).toISOString(),
})
const isVisible = (it, now) => !it.done || now - (it.doneAt || 0) < HIDE_DONE_AFTER_MS
const displayOrder = (items) => [...items].sort((a, b) => {
  if (a.done !== b.done) return a.done ? 1 : -1
  if (a.done) return (b.doneAt || 0) - (a.doneAt || 0)
  return (b.createdAt || 0) - (a.createdAt || 0)
})
/** What the page shows: open and parked, hiding items ticked more than a day ago. */
export function split(items = [], now = Date.now()) {
  const visible = items.filter((it) => isVisible(it, now))
  return { open: displayOrder(visible.filter((it) => !it.parked)), parked: displayOrder(visible.filter((it) => it.parked)) }
}
export const summarise = (list, now = Date.now()) => {
  const { open, parked } = split(list.items, now)
  return { id: list.id, name: list.name, open: open.filter((it) => !it.done).length, parked: parked.length }
}

const ok = (text, structuredContent) => ({ content: [{ type: 'text', text }], structuredContent })
const fail = (text) => ({ isError: true, content: [{ type: 'text', text }] })
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function buildServer(sutomi, { now = Date.now } = {}) {
  const server = new McpServer({ name: 'sutomi', version: '0.1.0' })

  async function findList(id) {
    try { return await sutomi.getList(id) } catch (e) {
      if (e.status === 404) return null
      throw e
    }
  }

  server.registerTool('list_tasklists', {
    title: 'List tasklists',
    description: 'The tasklists on sutomi with their ids, names and counts of open and parked items. Call this first to find the list_id for another tool; match the user\'s words to a name yourself and ask if several fit.',
    outputSchema: z.object({ lists: z.array(ListSummary) }),
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => {
    const lists = (await sutomi.listLists()).map((l) => summarise(l, now()))
    const text = lists.length
      ? `${plural(lists.length, 'list')}: ${lists.map((l) => `${l.name} (${l.open} open${l.parked ? `, ${l.parked} parked` : ''})`).join('; ')}`
      : 'No tasklists yet.'
    return ok(text, { lists })
  })

  server.registerTool('get_tasklist', {
    title: 'Get a tasklist',
    description: 'One tasklist with its visible items: open items newest first (ticked ones last), then parked items. Items ticked more than a day ago are not shown.',
    inputSchema: z.object({ list_id: z.string().min(1).describe('From list_tasklists') }),
    outputSchema: z.object({ id: z.string(), name: z.string(), open: z.array(Item), parked: z.array(Item) }),
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ list_id }) => {
    const list = await findList(list_id)
    if (!list) return fail(`No tasklist with id ${list_id}.`)
    const { open, parked } = split(list.items, now())
    const line = (items) => items.map((it) => `${it.text}${it.done ? ' (done)' : ''}`).join(', ') || 'nothing'
    const text = `${list.name}: ${line(open)}${parked.length ? `. Parked: ${line(parked)}` : ''}.`
    return ok(text, { id: list.id, name: list.name, open: open.map(toItem), parked: parked.map(toItem) })
  })

  server.registerTool('add_task', {
    title: 'Add a task',
    description: 'Add one item to a tasklist. Pass a unique request_key for every new request; sending the same request_key again (e.g. after a lost connection) returns the item already added instead of adding another.',
    inputSchema: z.object({
      list_id: z.string().min(1).describe('From list_tasklists'),
      text: z.string().trim().min(1).max(500).describe('The task, as the user said it'),
      priority: z.enum(['medium', 'high']).optional().describe('Omit for a normal task'),
      request_key: z.string().min(8).max(200).optional().describe('Unique per request; repeating it is safe'),
    }),
    outputSchema: z.object({ created: z.boolean(), list: z.object({ id: z.string(), name: z.string() }), item: Item }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ list_id, text, priority, request_key }) => {
    const list = await findList(list_id)
    if (!list) return fail(`No tasklist with id ${list_id}.`)
    const id = request_key ? itemIdFor(request_key) : randomId()
    const existing = (list.items || []).find((it) => it.id === id)
    if (existing) {
      return ok(`${existing.text} was already on ${list.name}.`, { created: false, list: { id: list.id, name: list.name }, item: toItem(existing) })
    }
    const item = { id, text, done: false, createdAt: now(), ...(priority ? { priority } : {}) }
    const merged = await sutomi.patchList(list.id, { ops: [{ type: 'add', item }] })
    const saved = (merged.items || []).find((it) => it.id === id)
    if (!saved) return fail(`sutomi did not confirm the item on ${list.name}.`)
    return ok(`Added ${saved.text} to ${merged.name}.`, { created: true, list: { id: merged.id, name: merged.name }, item: toItem(saved) })
  })

  return server
}
