// The scripted side of the voice conversation: understanding one utterance. Pure functions, no I/O.
// There is no language model here — the script knows a handful of shapes ("add X to Y", a list name,
// yes, no) and asks when it isn't sure, which suits dictated speech better than guessing.

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
