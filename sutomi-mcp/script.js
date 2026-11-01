// The scripted side of the voice conversation: understanding one utterance. Pure functions, no I/O.
// There is no language model here — the script knows a handful of shapes ("add X to Y", "add X on
// Friday at 3", "what's on tomorrow", "what's on the shopping list", a list name, yes, no) and asks
// when it isn't sure, which suits dictated speech better than guessing.
import { parseWhen } from './dates.js'

/** Lower-case, drop filler words and punctuation, so "the Shopping list" and "shopping" compare equal. */
export const normalise = (s) => String(s || '')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\b(?:the|my|our|a|an|list|lists|one)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** Lists whose name fits the spoken words: exact first, then containing, then sharing a word. */
export function matchLists(query, lists) {
  const q = normalise(query)
  if (!q) return []
  const exact = lists.filter((l) => normalise(l.name) === q)
  if (exact.length) return exact
  const partial = lists.filter((l) => { const n = normalise(l.name); return n && (n.includes(q) || q.includes(n)) })
  if (partial.length) return partial
  const words = q.split(' ').filter((w) => w.length >= 3)
  return lists.filter((l) => normalise(l.name).split(' ').some((w) => w.length >= 3 && words.includes(w)))
}

const LEAD = /^(?:(?:hey|hi|ok|okay|please|can you|could you|would you|i want to|i need to|i'd like to)\s+)*(?:add|put|note|note down|write down|remember|remind me to)(?:\s+|$)(?:(?:a|an|the)\s+)?(?:(?:new\s+)?(?:task|item|note)\s+)?(?:to\s+)?/i
const SPLIT = /\s+(?:to|on|onto|in|into|under)\s+(?:the\s+|my\s+|our\s+)?/gi
const tidy = (s) => s.replace(/^[\s,:;-]+|[\s.,!?;:]+$/g, '')

/**
 * "add milk to the shopping list" → { task: 'milk', listName: 'shopping', matches: [Shopping] }.
 * Splits are tried from the right and only kept when the right-hand side names a known list, so
 * "go to the gym" stays one task. With no list found, the whole utterance is the task.
 */
export function parseAdd(text, lists) {
  let t = tidy(String(text || ''))
  t = tidy(t.replace(LEAD, ''))
  const splits = [...t.matchAll(SPLIT)]
  for (let i = splits.length - 1; i >= 0; i--) {
    const m = splits[i]
    const task = tidy(t.slice(0, m.index))
    const listName = tidy(t.slice(m.index + m[0].length))
    if (!task || !listName) continue
    const matches = matchLists(listName, lists)
    if (matches.length) return { task, listName, matches }
  }
  return { task: t, listName: null, matches: [] }
}

const YES = /^(?:yes|yeah|yep|yup|ya|ok|okay|sure|correct|confirm|confirmed|right|that'?s right|do it|go ahead|go on|please do|add it|save it|fine|affirmative)\b/i
const NO = /^(?:no|nope|nah|cancel|stop|never ?mind|forget it|don'?t|leave it|not now|scrap that|abort)\b/i
export const isYes = (text) => YES.test(tidy(String(text || '')))
export const isNo = (text) => NO.test(tidy(String(text || '')))

/** "A, B or C" */
export function joinNames(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

const CALENDAR = /\b(?:calendar|diary|event horizon|horizon|schedule|agenda)\b/i
const CAL_SUFFIX = /\s+(?:to|on|in|into|onto)\s+(?:the\s+|my\s+)?(?:calendar|diary|event horizon|horizon|schedule)$/i
const READ_LEAD = /^(?:(?:hey|hi|ok|okay|please|can you|could you|would you)\s+)*(?:what(?:'s|s| is)?(?: there)?(?: on| in| coming up| coming| happening| for)?|what do i have(?: on| for)?|what have i got(?: on| for)?|read(?: me| out| back)?|show me|tell me(?: what'?s on| what is on)?|is there anything(?: on| for)?|do i have anything(?: on| for)?|anything(?: on| for)?)(?:\s+|$)/i
const dropDeterminer = (s) => s.replace(/^(?:the|my|our)\s+/i, '')
export const mentionsCalendar = (text) => CALENDAR.test(String(text || ''))

/** "what's on tomorrow" / "read the shopping list" → what to read, or null if it isn't a read. */
export function parseRead(text, lists, today) {
  const t = tidy(String(text || ''))
  const m = READ_LEAD.exec(t)
  if (!m || !m[0].trim()) return null
  const rest = tidy(dropDeterminer(t.slice(m[0].length)))
  const when = parseWhen(rest || t, today) // "what's coming up": the lead itself carries the range
  if (when?.range) return { kind: 'read_calendar', range: when.range }
  if (when?.date) return { kind: 'read_calendar', range: { from: when.date, to: when.date, date: when.date } }
  if (!rest || CALENDAR.test(rest)) {
    if (!rest && !CALENDAR.test(t)) return { kind: 'read', target: null }
    return { kind: 'read_calendar', range: null }
  }
  return { kind: 'read_list', name: rest, matches: matchLists(rest, lists) }
}

/**
 * One utterance → what to do. Adds with a day (at the end or the start of the text) or an explicit
 * "to the calendar" go to Event Horizon; other adds go to a tasklist; reads come from parseRead.
 */
export function parseUtterance(text, lists, today) {
  let raw = tidy(String(text || ''))
  let leadingDate = null
  if (!LEAD.test(raw)) { // "tomorrow, add call the plumber"
    const w = parseWhen(raw, today)
    if (w?.date && w.start === 0 && LEAD.test(tidy(raw.slice(w.end)))) { leadingDate = w; raw = tidy(raw.slice(w.end)) }
  }
  if (LEAD.test(raw)) {
    const explicit = CAL_SUFFIX.test(raw)
    const t = tidy(tidy(raw.replace(LEAD, '')).replace(CAL_SUFFIX, ''))
    const when = leadingDate || parseWhen(t, today)
    if (when?.date) {
      const atEnd = leadingDate || !tidy(t.slice(when.end)), atStart = !leadingDate && when.start === 0
      if (atEnd || atStart) {
        let task = leadingDate ? t : tidy(atEnd ? t.slice(0, when.start) : t.slice(when.end))
        task = tidy(task.replace(/\s+(?:on|for|by|at)$/i, '').replace(/^(?:on|for|by|at)\s+/i, ''))
        if (task) return { kind: 'add_calendar', task, date: when.date, time: when.time || null }
      }
    }
    if (explicit) return { kind: 'add_calendar', task: t, date: null, time: null }
    return { kind: 'add_list', ...parseAdd(raw, lists) }
  }
  const read = parseRead(raw, lists, today)
  if (read) return read
  return { kind: 'add_list', ...parseAdd(raw, lists) }
}

/** "call the dentist tomorrow at 2.30" → { task, date, time } (date null when none was said). */
export function parseEvent(text, today) {
  const t = tidy(tidy(tidy(String(text || '')).replace(LEAD, '')).replace(CAL_SUFFIX, ''))
  const when = parseWhen(t, today)
  if (when?.date) {
    const atEnd = !tidy(t.slice(when.end)), atStart = when.start === 0
    if (atEnd || atStart) {
      const task = tidy(tidy(atEnd ? t.slice(0, when.start) : t.slice(when.end)).replace(/\s+(?:on|for|by|at)$/i, '').replace(/^(?:on|for|by|at)\s+/i, ''))
      return { task, date: when.date, time: when.time || null }
    }
  }
  return { task: t, date: null, time: null }
}
