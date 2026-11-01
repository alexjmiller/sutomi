// The conversation service behind POST /voice: a scripted, stateful exchange that ends in exactly
// one tool call (or none). Siri Shortcuts sends { conversation_id?, text } and gets back
// { conversation_id, reply, finished, next } — `reply` is spoken, `next` is "listen" or "stop".
//
// Shape of a conversation: find out the task and the list (asking when a name is missing or fits
// several lists), read the draft back ("Add milk to Shopping?"), and only a yes commits — that exact
// stored draft, with a request_key, so a retried request cannot add the task twice. A conversation
// that goes quiet expires without committing; a finished one keeps its last reply for a while so a
// Shortcut that lost the response and asks again hears the same answer.
import { randomBytes } from 'crypto'
import { parseAdd, matchLists, isYes, isNo, joinNames } from './script.js'

export const OPENING = 'What would you like to add?'

export function createVoice({ call, now = Date.now, ttlMs = 10 * 60 * 1000, keepFinishedMs = 60 * 60 * 1000, log = () => {} }) {
  const convs = new Map()
  const newId = () => randomBytes(8).toString('hex')

  function sweep() {
    const t = now()
    for (const [id, c] of convs) {
      if (c.finished ? t - c.updatedAt > keepFinishedMs : t - c.updatedAt > ttlMs) convs.delete(id)
    }
  }

  const respond = (conv, reply) => {
    conv.reply = reply
    return { conversation_id: conv.id, reply, finished: Boolean(conv.finished), next: conv.finished ? 'stop' : 'listen' }
  }
  const finish = (conv, outcome, reply) => { conv.finished = true; conv.outcome = outcome; conv.step = 'done'; log(`${conv.id} ${outcome}`); return reply }

  async function lists(conv) {
    if (!conv.lists) conv.lists = (await call('list_tasklists')).lists
    return conv.lists
  }

  function toConfirm(conv, list, task) {
    conv.drafts += 1
    conv.draft = { list: { id: list.id, name: list.name }, task, request_key: `voice:${conv.id}:${conv.drafts}` }
    conv.step = 'confirm'
    conv.misses = 0
    return `Add ${task} to ${list.name}?`
  }

  function askList(conv, candidates, prefix = '') {
    conv.candidates = candidates
    conv.step = 'need_list'
    return `${prefix}Which list: ${joinNames(candidates.map((l) => l.name))}?`
  }

  async function interpret(conv, text) {
    const all = await lists(conv)
    if (!all.length) return finish(conv, 'no-lists', 'You have no tasklists yet. Make one on sutomi first.')
    const { task, matches } = parseAdd(text, all)
    if (!task) { conv.step = 'need_text'; return 'What is the task?' }
    conv.task = task
    if (matches.length === 1) return toConfirm(conv, matches[0], task)
    if (matches.length > 1) return askList(conv, matches)
    if (all.length === 1) return toConfirm(conv, all[0], task)
    return askList(conv, all)
  }

  async function commit(conv) {
    const d = conv.draft
    const r = await call('add_task', { list_id: d.list.id, text: d.task, request_key: d.request_key })
    return finish(conv, r.created ? 'added' : 'already-added', r.created ? `Added ${r.item.text} to ${r.list.name}.` : `${r.item.text} was already on ${r.list.name}.`)
  }

  const cancel = (conv) => finish(conv, 'cancelled', 'OK, nothing added.')
  const giveUp = (conv) => finish(conv, 'gave-up', "Let's leave it there. Nothing was added.")
  function miss(conv, reply) {
    conv.misses += 1
    return conv.misses >= 2 ? giveUp(conv) : reply
  }

  async function step(conv, text) {
    if (conv.step === 'start' || conv.step === 'need_text') {
      if (!text) { conv.step = 'need_text'; return OPENING }
      return interpret(conv, text)
    }
    if (conv.step === 'need_list') {
      if (isNo(text)) return cancel(conv)
      const all = await lists(conv)
      const restated = parseAdd(text, all)
      if (restated.listName && restated.matches.length === 1) return toConfirm(conv, restated.matches[0], restated.task)
      let matches = matchLists(text, conv.candidates || all)
      if (!matches.length) matches = matchLists(text, all)
      if (matches.length === 1) return toConfirm(conv, matches[0], conv.task)
      if (matches.length > 1) return askList(conv, matches)
      return miss(conv, `I don't have a list called ${text.replace(/[.!?]+$/, '')}. Your lists are ${joinNames(all.map((l) => l.name))}. Which one?`)
    }
    if (conv.step === 'confirm') {
      if (isYes(text)) return commit(conv)
      if (isNo(text)) return cancel(conv)
      const restated = parseAdd(text, await lists(conv))
      if (restated.listName && restated.matches.length === 1) return toConfirm(conv, restated.matches[0], restated.task)
      return miss(conv, `Say yes to add ${conv.draft.task} to ${conv.draft.list.name}, or no to cancel.`)
    }
    return giveUp(conv)
  }

  /** One turn. Safe to repeat: a finished conversation answers with its final reply again. */
  async function handle({ conversation_id, text } = {}) {
    sweep()
    text = String(text ?? '').trim().slice(0, 500)
    let conv = conversation_id ? convs.get(String(conversation_id)) : null
    const lost = Boolean(conversation_id) && !conv
    if (conv?.finished) return respond(conv, conv.reply)
    if (!conv) {
      conv = { id: newId(), step: 'start', misses: 0, drafts: 0, createdAt: now(), finished: false }
      convs.set(conv.id, conv)
    }
    conv.updatedAt = now()
    if (lost) { conv.step = 'need_text'; return respond(conv, `I lost track of that conversation, so nothing was added. ${OPENING}`) }
    try {
      return respond(conv, await step(conv, text))
    } catch (e) {
      log(`${conv.id} error: ${e.message}`)
      return respond(conv, finish(conv, 'error', "Sorry, I couldn't reach sutomi. Nothing was added."))
    }
  }

  /** For a Shortcut that lost a reply: what happened to this conversation? */
  function status(id) {
    sweep()
    const conv = convs.get(String(id))
    if (!conv) return null
    return { conversation_id: conv.id, finished: Boolean(conv.finished), outcome: conv.outcome || null, reply: conv.reply || null, next: conv.finished ? 'stop' : 'listen' }
  }

  return { handle, status, size: () => convs.size }
}
