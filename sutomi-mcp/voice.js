// The conversation service behind POST /voice: a scripted, stateful exchange that ends in at most
// one write. Siri Shortcuts sends { conversation_id?, text } and gets back
// { conversation_id, reply, finished, next } — `reply` is spoken, `next` is "listen" or "stop".
//
// What it can do: add a task to a tasklist ("add milk to shopping"), put a task on a day in Event
// Horizon ("add call the dentist tomorrow at 2.30", "remind me to put the bins out on Sunday"), and
// read back a list ("what's on the shopping list") or the calendar ("what's on tomorrow", "what's
// coming up", "what do I have next week"). Dates are Europe/London.
//
// Shape of an add: find out the task and the list or the day (asking when something is missing or
// a name fits several lists), read the draft back ("Add milk to Shopping?"), and only a yes commits —
// that exact stored draft, with a request_key, so a retried request cannot add the task twice. A
// conversation that goes quiet expires without committing; a finished one keeps its last reply for a
// while so a Shortcut that lost the response and asks again hears the same answer.
import { randomBytes } from 'crypto'
import { parseUtterance, parseRead, parseEvent, parseAdd, matchLists, mentionsCalendar, isYes, isNo, joinNames } from './script.js'
import { parseWhen, speakDate, speakTime, todayIn, daysBetween } from './dates.js'

export const OPENING = 'What would you like?'
/**
 * A Shortcut says what it is for with `mode` on its first call, and the conversation opens with that
 * job's question and keeps to it: task = add to a tasklist, event = put something on the calendar,
 * tasks = read a list, events = read the calendar. No mode = the mixed script that works out the
 * intent from the words.
 */
export const MODES = {
  task: 'What would you like to add?',
  event: "What's the event, and when?",
  tasks: 'Which list?',
  events: 'For which day?',
}
const MAX_SPOKEN = 12
const THATS_ALL = "That's all." // closes a readout, so Siri's own sign-off isn't the last thing heard

const joinAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const withMore = (names, n) => (n > names.length ? [...names, `${n - names.length} more`] : names)

export function createVoice({ call, now = Date.now, ttlMs = 10 * 60 * 1000, keepFinishedMs = 60 * 60 * 1000, log = () => {} }) {
  const convs = new Map()
  const newId = () => randomBytes(8).toString('hex')
  const today = () => todayIn(now())

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

  // ---- speaking dates -------------------------------------------------------------------------
  /** "tomorrow", "on Friday", "this week", "in the next 7 days", "at the weekend". */
  function inWords(range) {
    if (range.date) { const d = speakDate(range.date, today()); return daysBetween(today(), range.date) <= 1 ? d : `on ${d}` }
    if (range.label.startsWith('the next')) return `in ${range.label}`
    if (range.label.endsWith('weekend')) return `at ${range.label}`
    return range.label
  }
  const whenWords = (date, time) => `${speakDate(date, today())}${time ? ` at ${speakTime(time)}` : ''}`

  // ---- drafts ---------------------------------------------------------------------------------
  function newDraft(conv, draft) {
    conv.drafts += 1
    conv.draft = { ...draft, request_key: `voice:${conv.id}:${conv.drafts}` }
    conv.step = 'confirm'
    conv.misses = 0
  }
  function toConfirmList(conv, list, task) {
    newDraft(conv, { type: 'list', list: { id: list.id, name: list.name }, task })
    return `Add ${task} to ${list.name}. Is that correct?`
  }
  function toConfirmCalendar(conv, task, date, time) {
    newDraft(conv, { type: 'calendar', kind: conv.mode === 'event' ? 'event' : 'task', task, date, time })
    return `Add ${task} for ${whenWords(date, time)}. Is that correct?`
  }
  function askList(conv, candidates, prefix = '') {
    conv.candidates = candidates
    conv.step = 'need_list'
    return `${prefix}Which list: ${joinNames(candidates.map((l) => l.name))}?`
  }
  function askDay(conv, task) {
    conv.task = task
    conv.step = 'need_date'
    return `Which day?`
  }

  // ---- reading --------------------------------------------------------------------------------
  async function readList(conv, list) {
    const r = await call('get_tasklist', { list_id: list.id })
    const open = r.open.filter((it) => !it.done)
    if (!open.length) return finish(conv, 'read', `${r.name} is empty${r.parked.length ? `, with ${r.parked.length} parked` : ''}.`)
    const names = withMore(open.slice(0, MAX_SPOKEN).map((it) => it.text), open.length)
    return finish(conv, 'read', `${r.name}, ${open.length} open: ${joinAnd(names)}.${r.parked.length ? ` And ${r.parked.length} parked.` : ''} ${THATS_ALL}`)
  }
  async function readCalendar(conv, range) {
    range ||= parseWhen('coming up', today()).range
    const fetched = (await call('list_calendar', { from: range.from, to: range.to })).items
    const seen = new Set()
    const items = fetched.filter((it) => { const k = `${it.date}|${it.time || ''}|${it.title.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true })
    const phrase = inWords(range)
    if (!items.length) return finish(conv, 'read', `Nothing ${phrase}.`)
    const line = (it) => `${it.title}${it.time ? ` at ${speakTime(it.time)}` : ''}`
    const count = items.length === 1 ? 'one thing' : `${items.length} things`
    if (range.from === range.to) return finish(conv, 'read', `${capital(phrase)}, ${count}: ${joinAnd(withMore(items.slice(0, MAX_SPOKEN).map(line), items.length))}. ${THATS_ALL}`)
    const byDay = new Map()
    for (const it of items.slice(0, MAX_SPOKEN)) {
      const day = it.date < range.from ? range.from : it.date
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push(line(it))
    }
    const days = [...byDay].map(([day, lines]) => `${capital(speakDate(day, today()))}: ${joinAnd(lines)}.`)
    const more = items.length > MAX_SPOKEN ? ` And ${items.length - MAX_SPOKEN} more.` : ''
    return finish(conv, 'read', `${capital(phrase)}, ${count}. ${days.join(' ')}${more} ${THATS_ALL}`)
  }

  // ---- understanding ----------------------------------------------------------------------------
  async function interpret(conv, text) {
    const all = await lists(conv)
    const u = byMode(conv.mode, text, all)
    if (u.kind === 'read_calendar') return readCalendar(conv, u.range)
    if (u.kind === 'read_list') {
      conv.reading = true
      if (u.matches.length === 1) return readList(conv, u.matches[0])
      if (u.matches.length > 1) { conv.reading = true; return askList(conv, u.matches) }
      if (!all.length) return finish(conv, 'read', 'You have no tasklists.')
      conv.reading = true
      return miss(conv, `I don't have a list called ${u.name}. Your lists are ${joinNames(all.map((l) => l.name))}. Which one?`, 'need_list')
    }
    if (u.kind === 'read') { conv.step = 'need_read'; return 'Read a list, or the calendar?' }
    if (u.kind === 'need_day') return miss(conv, 'Which day? Say today, tomorrow, a weekday, next week, or a date.')
    if (u.kind === 'add_calendar') {
      if (!u.task) { conv.step = 'need_text'; return conv.mode === 'event' ? "What's the event?" : 'What is the task?' }
      return u.date ? toConfirmCalendar(conv, u.task, u.date, u.time) : askDay(conv, u.task)
    }
    // add_list
    if (!u.task) { conv.step = 'need_text'; return 'What is the task?' }
    if (!all.length) return finish(conv, 'no-lists', 'You have no tasklists yet. Make one on sutomi first.')
    conv.task = u.task
    if (u.matches.length === 1) return toConfirmList(conv, u.matches[0], u.task)
    if (u.matches.length > 1) return askList(conv, u.matches)
    if (all.length === 1) return toConfirmList(conv, all[0], u.task)
    return askList(conv, all)
  }

  /** The utterance as the mode reads it. */
  function byMode(mode, text, all) {
    if (mode === 'task') return { kind: 'add_list', ...parseAdd(text, all) }
    if (mode === 'event') return { kind: 'add_calendar', ...parseEvent(text, today()) }
    if (mode === 'tasks') return { kind: 'read_list', name: text, matches: matchLists(text, all) }
    if (mode === 'events') {
      const w = parseWhen(text, today())
      if (w?.range) return { kind: 'read_calendar', range: w.range }
      if (w?.date) return { kind: 'read_calendar', range: { from: w.date, to: w.date, date: w.date } }
      return { kind: 'need_day' }
    }
    return parseUtterance(text, all, today())
  }

  async function commit(conv) {
    const d = conv.draft
    if (d.type === 'calendar') {
      const r = await call('add_calendar_task', { title: d.task, kind: d.kind, date: d.date, ...(d.time ? { time: d.time } : {}), request_key: d.request_key })
      const when = whenWords(r.item.date, r.item.time)
      return finish(conv, r.created ? 'added' : 'already-added', r.created ? `Added ${r.item.title} for ${when}.` : `${r.item.title} was already on the calendar for ${when}.`)
    }
    const r = await call('add_task', { list_id: d.list.id, text: d.task, request_key: d.request_key })
    return finish(conv, r.created ? 'added' : 'already-added', r.created ? `Added ${r.item.text} to ${r.list.name}.` : `${r.item.text} was already on ${r.list.name}.`)
  }

  const cancel = (conv) => finish(conv, 'cancelled', 'OK, nothing added.')
  const giveUp = (conv) => finish(conv, 'gave-up', "Let's leave it there. Nothing was added.")
  function miss(conv, reply, step) {
    conv.misses += 1
    if (step) conv.step = step
    return conv.misses >= 2 ? giveUp(conv) : reply
  }

  /** The reply restated a whole request ("add X to Y", "add X tomorrow") — start that draft instead. */
  async function restated(conv, text) {
    const u = parseUtterance(text, await lists(conv), today())
    if (u.kind === 'add_calendar' && u.task && u.date) return toConfirmCalendar(conv, u.task, u.date, u.time)
    if (u.kind === 'add_list' && u.listName && u.matches.length === 1) return toConfirmList(conv, u.matches[0], u.task)
    return null
  }

  async function step(conv, text) {
    if (conv.step === 'start' || conv.step === 'need_text') {
      if (!text) { conv.step = 'need_text'; return MODES[conv.mode] || OPENING }
      return interpret(conv, text)
    }
    if (conv.step === 'need_read') {
      const all = await lists(conv)
      const r = parseRead(`what's on ${text}`, all, today())
      if (r?.kind === 'read_calendar') return readCalendar(conv, r.range)
      if (r?.kind === 'read_list' && r.matches.length === 1) return readList(conv, r.matches[0])
      if (r?.kind === 'read_list' && r.matches.length > 1) { conv.reading = true; return askList(conv, r.matches) }
      if (isNo(text)) return cancel(conv)
      return miss(conv, `Say a list name, or the calendar. Your lists are ${joinNames(all.map((l) => l.name))}.`)
    }
    if (conv.step === 'need_list') {
      if (isNo(text)) return cancel(conv)
      const all = await lists(conv)
      const again = await restated(conv, text)
      if (again) return again
      if (!conv.reading && mentionsCalendar(text)) return askDay(conv, conv.task)
      let matches = matchLists(text, conv.candidates || all)
      if (!matches.length) matches = matchLists(text, all)
      if (matches.length === 1) return conv.reading ? readList(conv, matches[0]) : toConfirmList(conv, matches[0], conv.task)
      if (matches.length > 1) return askList(conv, matches)
      return miss(conv, `I don't have a list called ${text.replace(/[.!?]+$/, '')}. Your lists are ${joinNames(all.map((l) => l.name))}. Which one?`)
    }
    if (conv.step === 'need_date') {
      if (isNo(text)) return cancel(conv)
      const again = await restated(conv, text)
      if (again) return again
      const w = parseWhen(text, today())
      if (w?.date) return toConfirmCalendar(conv, conv.task, w.date, w.time)
      if (w?.range) return miss(conv, `Which day ${inWords(w.range)}?`)
      return miss(conv, 'I didn\'t catch the day. Say something like tomorrow, Friday, or the 12th of March.')
    }
    if (conv.step === 'confirm') {
      if (isYes(text)) return commit(conv)
      if (isNo(text)) return cancel(conv)
      const again = await restated(conv, text)
      if (again) return again
      const d = conv.draft
      return miss(conv, `Say yes to add ${d.task} ${d.type === 'calendar' ? `for ${whenWords(d.date, d.time)}` : `to ${d.list.name}`}, or no to cancel.`)
    }
    return giveUp(conv)
  }

  /** One turn. Safe to repeat: a finished conversation answers with its final reply again. */
  async function handle({ conversation_id, text, mode } = {}) {
    sweep()
    text = String(text ?? '').trim().slice(0, 500)
    mode = Object.hasOwn(MODES, String(mode)) ? String(mode) : null
    let conv = conversation_id ? convs.get(String(conversation_id)) : null
    const lost = Boolean(conversation_id) && !conv
    if (conv?.finished) return respond(conv, conv.reply)
    if (!conv) {
      conv = { id: newId(), mode, step: 'start', misses: 0, drafts: 0, createdAt: now(), finished: false }
      convs.set(conv.id, conv)
    }
    conv.updatedAt = now()
    if (lost) { conv.step = 'need_text'; return respond(conv, `I lost track of that conversation, so nothing was added. ${MODES[conv.mode] || OPENING}`) }
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
