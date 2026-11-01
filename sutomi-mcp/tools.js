// The MCP server: sutomi's tasklists as tools. Each tool returns a spoken-friendly text line plus
// structuredContent matching its outputSchema, so both a voice script and an LLM client can use it.
//
// Idempotent writes: `add_task` takes a `request_key`; the item's id is derived from it, and sutomi
// ignores an add whose id already exists, so repeating a request after a dropped connection returns
// the original item instead of a duplicate. `add_calendar_task` can't choose the substrate's id, so it
// remembers recent request keys and, before creating, looks for an open task with the same title on
// the same day — a retry finds the one already there.
//
// Event Horizon (the calendar) is reached through sutomi's substrate proxy: materialized occurrences
// for reading, POST /events (+ a reminder) for a plain task on a date. Dates are Europe/London.
import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { createHash, randomBytes } from 'crypto'
import { ZONE, addDays, instantOf, localOf } from './dates.js'

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
const CalendarItem = z.object({
  id: z.string().describe('Occurrence id (one per day of a series); the event id for a just-created task'),
  event_id: z.string(),
  title: z.string(),
  kind: z.enum(['task', 'event', 'info']),
  date: z.string().describe(`YYYY-MM-DD in ${ZONE}`),
  end_date: z.string().optional().describe('Last day, when it spans several'),
  time: z.string().optional().describe(`HH:MM in ${ZONE}; absent for all-day items`),
  end_time: z.string().optional(),
  completed: z.boolean(),
  chain: z.string().nullable().describe('The Event Horizon instance tag when the item belongs to a preparation chain'),
})
/** request_key → the task it created, so a repeated request (the process is long-lived) answers the same. */
const recentCalendarAdds = new Map()

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

  // ---- Event Horizon: the calendar ---------------------------------------------------------------

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
  const INSTANCE_TAG = /^ehn:[a-z0-9-]+:[0-9a-f]+$/
  const dateInput = (what) => z.string().regex(ISO_DATE).describe(`${what}, YYYY-MM-DD in ${ZONE}`)
  const sameTitle = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

  function toCalendarItem(occ) {
    const item = { id: occ.occurrence_id, event_id: occ.event_id, title: occ.title, kind: occ.kind || (occ.is_task ? 'task' : 'event'), completed: Boolean(occ.completed_at), chain: (occ.tags || []).find((t) => INSTANCE_TAG.test(t)) || null }
    if (occ.time_type === 'all_day') {
      item.date = occ.starts_at.slice(0, 10)
      const last = addDays(occ.ends_at.slice(0, 10), -1)
      if (last > item.date) item.end_date = last
    } else {
      const s = localOf(occ.starts_at), e = localOf(occ.ends_at)
      item.date = s.date; item.time = s.time; item.end_time = e.time
      if (e.date > s.date) item.end_date = e.date
    }
    return item
  }
  const byWhen = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0)

  /** Occurrences whose days overlap [from, to] (inclusive, London dates), as CalendarItems. */
  async function fetchRange({ from, to, kinds, query, includeCompleted }) {
    const params = { from: instantOf(from, '00:00').toISOString(), to: instantOf(addDays(to, 1), '00:00').toISOString(), limit: '100' }
    if (query) params.q = query
    if (kinds.length === 1) params.kind = kinds[0]
    const items = []
    let cursor = null
    for (let page = 0; page < 10; page++) {
      const r = await sutomi.ehEvents(cursor ? { ...params, cursor } : params)
      items.push(...r.items.map(toCalendarItem))
      cursor = r.next_cursor
      if (!cursor) break
    }
    return items
      .filter((it) => it.date <= to && (it.end_date || it.date) >= from)
      .filter((it) => kinds.includes(it.kind))
      .filter((it) => includeCompleted || !it.completed)
      .sort(byWhen)
  }
  const whenText = (it) => `${it.date}${it.end_date ? `–${it.end_date}` : ''}${it.time ? ` ${it.time}` : ''}`

  server.registerTool('list_calendar', {
    title: 'What is on the calendar',
    description: `Event Horizon items (tasks, events, information) between two dates inclusive, in ${ZONE}, earliest first. Tasks and events by default; completed tasks are left out unless asked for. The calendar only knows about 18 months ahead.`,
    inputSchema: z.object({
      from: dateInput('First day'),
      to: dateInput('Last day (inclusive)').optional().describe(`Last day, inclusive; omit for one day`),
      kinds: z.array(z.enum(['task', 'event', 'info'])).min(1).optional().describe('Default: task and event. info = bank holidays, school terms and the like'),
      query: z.string().trim().min(1).max(100).optional().describe('Words in the title'),
      include_completed: z.boolean().optional(),
    }),
    outputSchema: z.object({ from: z.string(), to: z.string(), items: z.array(CalendarItem) }),
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ from, to = from, kinds = ['task', 'event'], query, include_completed = false }) => {
    if (to < from) return fail('`to` is before `from`.')
    const items = await fetchRange({ from, to, kinds, query, includeCompleted: include_completed })
    const text = items.length ? `${plural(items.length, 'item')}: ${items.map((it) => `${it.title} (${whenText(it)}${it.completed ? ', done' : ''})`).join('; ')}` : `Nothing between ${from} and ${to}.`
    return ok(text, { from, to, items })
  })

  server.registerTool('add_calendar_task', {
    title: 'Add to the calendar',
    description: `Put a plain task (default) or event on a day in Event Horizon (${ZONE}), with a reminder: at 09:00 for an all-day item, at the start of a timed task, 30 minutes before a timed event. Not for things that need preparation chains — those come from the Event Horizon interview. Pass a unique request_key per new request; repeating it returns the item already added. An open item of the same kind with the same title on the same day is also treated as already added.`,
    inputSchema: z.object({
      title: z.string().trim().min(1).max(200).describe('The task or event, as the user said it'),
      kind: z.enum(['task', 'event']).optional().describe('task (completable, default) or event (a thing happening)'),
      date: dateInput('The day'),
      time: z.string().regex(HHMM).optional().describe(`HH:MM in ${ZONE}; omit for an all-day task`),
      duration_minutes: z.number().int().min(5).max(720).optional().describe('With a time only; default 60'),
      request_key: z.string().min(8).max(200).optional().describe('Unique per request; repeating it is safe'),
    }),
    outputSchema: z.object({ created: z.boolean(), item: CalendarItem }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ title, kind = 'task', date, time, duration_minutes = 60, request_key }) => {
    const remembered = request_key && recentCalendarAdds.get(request_key)
    if (remembered) return ok(`${remembered.title} was already on the calendar for ${whenText(remembered)}.`, { created: false, item: remembered })
    const twin = (await fetchRange({ from: date, to: date, kinds: [kind], query: title, includeCompleted: false })).find((it) => sameTitle(it.title, title) && (it.time || null) === (time || null))
    if (twin) return ok(`${twin.title} was already on the calendar for ${whenText(twin)}.`, { created: false, item: twin })
    const common = { title, kind, tags: ['sutomi'], metadata: { sutomi: { via: 'mcp', ...(request_key ? { request_key } : {}) } } }
    const body = time
      ? { time_type: 'timed', timezone: ZONE, dtstart_local: `${date}T${time}:00`, duration_seconds: duration_minutes * 60, ...common }
      : { time_type: 'all_day', start_date: date, end_date: addDays(date, 1), ...common }
    const ev = await sutomi.ehCreateEvent(body)
    const offset = !time ? 9 * 3600 : kind === 'event' ? -30 * 60 : 0
    try { await sutomi.ehAddReminder(ev.id, { trigger: 'relative', offset_seconds: offset }) } catch { /* the item exists; a missing reminder is not worth failing the add */ }
    const item = { id: ev.id, event_id: ev.id, title: ev.title, kind, date, ...(time ? { time } : {}), completed: false, chain: null }
    if (request_key) {
      recentCalendarAdds.set(request_key, item)
      if (recentCalendarAdds.size > 500) recentCalendarAdds.delete(recentCalendarAdds.keys().next().value)
    }
    return ok(`Added ${item.title} to the calendar for ${whenText(item)}.`, { created: true, item })
  })

  return server
}
