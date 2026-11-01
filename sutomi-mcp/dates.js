// Dates for the voice script and the calendar tools, always in Europe/London. Pure, no dependencies:
// the substrate stores all-day items as floating dates and timed items as wall-clock + zone, so
// everything here works on YYYY-MM-DD strings and HH:MM strings, with Intl doing the zone maths.
export const ZONE = 'Europe/London'
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_RE = 'monday|tuesday|tues|wednesday|weds|thursday|thurs|friday|saturday|sunday' // full names: "sat", "sun" and "mon" are words
const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const SMALL = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14 }
const num = (s) => (SMALL[s] ?? Number(s))
const dayIndex = (s) => DAY_NAMES.findIndex((d) => d.toLowerCase().startsWith(s.slice(0, 3)))
const monthIndex = (s) => MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(s.slice(0, 3)))

const pad = (n) => String(n).padStart(2, '0')
export const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const parts = (iso) => iso.split('-').map(Number)
const toUtc = (iso) => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d)) }
const fromUtc = (dt) => dt.toISOString().slice(0, 10)
export const addDays = (iso, n) => { const d = toUtc(iso); d.setUTCDate(d.getUTCDate() + n); return fromUtc(d) }
export const weekday = (iso) => toUtc(iso).getUTCDay()
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000)
export function validDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const fields = (instant, zone = ZONE) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))

/** The calendar date in the zone at this instant. */
export function todayIn(now = Date.now(), zone = ZONE) {
  const f = fields(new Date(now), zone)
  return isoDate(f.year, f.month, f.day)
}
/** { date, time } of an instant in the zone. */
export function localOf(instant, zone = ZONE) {
  const f = fields(new Date(instant), zone)
  return { date: isoDate(f.year, f.month, f.day), time: `${pad(f.hour)}:${pad(f.minute)}` }
}
/** The instant (Date) of a wall-clock time in the zone — correct across DST, as a zoned calendar would do it. */
export function instantOf(date, time = '00:00', zone = ZONE) {
  const [y, m, d] = parts(date)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, mi)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const f = fields(new Date(guess), zone)
    const seen = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute)
    guess += wall - seen
  }
  return new Date(guess)
}

// ---- parsing (dictated English, UK order) ----------------------------------------------------

const DATE_RE = new RegExp([
  '(?<rel>today|tonight|this evening|this morning|this afternoon|tomorrow(?: morning| afternoon| evening| night)?|(?:the )?day after tomorrow)',
  '(?<ddet>this coming |this |next |on |by |for )?(?<dow>' + DAY_RE + ')(?<dpart> morning| afternoon| evening| night)?',
  'in (?<inn>\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fourteen) (?<inu>days?|weeks?)',
  '(?:the )?(?<d1>\\d{1,2})(?:st|nd|rd|th)?(?: of)? (?<m1>' + MONTH_RE + ')(?: (?<y1>\\d{4}))?',
  '(?<m2>' + MONTH_RE + ') (?:the )?(?<d2>\\d{1,2})(?:st|nd|rd|th)?(?:,? (?<y2>\\d{4}))?',
  '(?<d3>\\d{1,2})/(?<m3>\\d{1,2})(?:/(?<y3>\\d{2,4}))?', // slashes only: "2.30" is a time
  '(?<y4>\\d{4})-(?<m4>\\d{2})-(?<d4>\\d{2})',
].map((s) => `(?:\\b${s}\\b)`).join('|'), 'i')
const RANGE_RE = /\b(?:(?<week>this week|the rest of the week|next week|the week after next)|(?<wkend>(?:this |next |the |at the )?weekend)|(?<month>this month|next month)|(?:(?:the |in the )?next (?<n>\d+|few|couple of|two|three|four|five|six|seven|ten|fourteen) (?<u>days|weeks))|(?<soon>coming up|upcoming|on the horizon))\b/i
const TIME_RE = /\b(?:at |@ ?)?(?:(?<noon>noon|midday)|(?<midn>midnight)|(?<h>\d{1,2})(?:[:.](?<mi>\d{2}))?\s*(?<ap>am|pm|a\.m\.|p\.m\.|o'?clock)?)\b/i

function resolveDate(g, today) {
  const dow = weekday(today)
  if (g.rel) {
    const r = g.rel.toLowerCase()
    if (r.startsWith('tomorrow')) return addDays(today, 1)
    if (r.includes('day after')) return addDays(today, 2)
    return today
  }
  if (g.dow) {
    const target = dayIndex(g.dow.toLowerCase())
    let diff = (target - dow + 7) % 7
    const det = (g.ddet || '').trim().toLowerCase()
    if (diff === 0 && det !== 'this') diff = 7 // "on Monday" said on a Monday means next week; "this Monday" is today
    return addDays(today, diff)
  }
  if (g.inn) return addDays(today, num(g.inn.toLowerCase()) * (g.inu.startsWith('week') ? 7 : 1))
  let y, m, d
  if (g.d1 || g.d2) {
    d = Number(g.d1 || g.d2); m = monthIndex((g.m1 || g.m2).toLowerCase()) + 1; y = g.y1 || g.y2 ? Number(g.y1 || g.y2) : null
  } else if (g.d3) {
    d = Number(g.d3); m = Number(g.m3); y = g.y3 ? (g.y3.length === 2 ? 2000 + Number(g.y3) : Number(g.y3)) : null
  } else {
    y = Number(g.y4); m = Number(g.m4); d = Number(g.d4)
  }
  if (y == null) {
    y = parts(today)[0]
    if (validDate(y, m, d) && isoDate(y, m, d) < today) y += 1 // a passed date means next year
  }
  return validDate(y, m, d) ? isoDate(y, m, d) : null
}

function resolveTime(g) {
  if (g.noon) return '12:00'
  if (g.midn) return '00:00'
  let h = Number(g.h)
  const mi = g.mi ? Number(g.mi) : 0
  if (h > 23 || mi > 59) return null
  const ap = (g.ap || '').toLowerCase()
  if (ap.startsWith('p') && h < 12) h += 12
  else if (ap.startsWith('a') && h === 12) h = 0
  else if (!ap && h >= 1 && h <= 6) h += 12 // "at 3" is far more often 3pm than 3am
  return `${pad(h)}:${pad(mi)}`
}

/** Monday of the week containing `iso`. */
const mondayOf = (iso) => addDays(iso, -((weekday(iso) + 6) % 7))

function resolveRange(g, today) {
  if (g.week) {
    const w = g.week.toLowerCase()
    if (w === 'next week') { const mon = addDays(mondayOf(today), 7); return { from: mon, to: addDays(mon, 6), label: 'next week' } }
    if (w === 'the week after next') { const mon = addDays(mondayOf(today), 14); return { from: mon, to: addDays(mon, 6), label: 'the week after next' } }
    return { from: today, to: addDays(mondayOf(today), 6), label: 'this week' }
  }
  if (g.wkend) {
    const next = /next/i.test(g.wkend)
    let sat = addDays(today, (6 - weekday(today) + 7) % 7)
    if (weekday(today) === 0) sat = addDays(today, -1) // on a Sunday "the weekend" is still this one
    if (next) sat = addDays(sat, 7)
    return { from: sat < today ? today : sat, to: addDays(sat, 1), label: next ? 'next weekend' : 'the weekend' }
  }
  if (g.month) {
    const [y, m] = parts(today)
    const first = g.month.toLowerCase() === 'next month' ? (m === 12 ? isoDate(y + 1, 1, 1) : isoDate(y, m + 1, 1)) : today
    const [fy, fm] = parts(first)
    const last = addDays(fm === 12 ? isoDate(fy + 1, 1, 1) : isoDate(fy, fm + 1, 1), -1)
    return { from: first, to: last, label: g.month.toLowerCase() }
  }
  if (g.n) {
    const n = { few: 3, 'couple of': 2 }[g.n.toLowerCase()] ?? num(g.n.toLowerCase())
    const days = g.u.startsWith('week') ? n * 7 : n
    return { from: today, to: addDays(today, days - 1), label: `the next ${days} days` }
  }
  return { from: today, to: addDays(today, 6), label: 'the next 7 days' }
}

/**
 * Find a day (or a span of days) and a time in dictated text.
 * → { date, time, start, end } for "tomorrow at 3", { range: {from,to,label}, start, end } for "next week",
 *   or null. `start`/`end` are the character span to cut out of the text. A time alone is not a date.
 */
export function parseWhen(text, today) {
  const s = String(text || '')
  const r = RANGE_RE.exec(s)
  if (r) return { range: resolveRange(r.groups, today), start: r.index, end: r.index + r[0].length }
  const m = DATE_RE.exec(s)
  if (!m) return null
  const date = resolveDate(m.groups, today)
  if (!date) return { invalid: true, start: m.index, end: m.index + m[0].length }
  let start = m.index, end = m.index + m[0].length, time = null
  const before = s.slice(0, start), after = s.slice(end)
  const ta = TIME_RE.exec(after)
  if (ta && /^\s*(?:at |@)/i.test(after.slice(ta.index)) && !after.slice(0, ta.index).trim()) { time = resolveTime(ta.groups); end += ta.index + ta[0].length }
  else {
    const tb = [...before.matchAll(new RegExp(TIME_RE.source, 'gi'))].pop()
    if (tb && /^(?:at |@)/i.test(tb[0]) && !before.slice(tb.index + tb[0].length).replace(/^\s+(?:on|for)?\s*$/, '').trim()) { time = resolveTime(tb.groups); start = tb.index }
  }
  if (!time && m.groups.dpart) time = null
  return { date, time, start, end }
}

// ---- speaking ----------------------------------------------------------------------------------

/** "today", "tomorrow", "Tuesday", "Tuesday 4 November", "Tuesday 4 November 2027". */
export function speakDate(iso, today, { weekdayOnly = true } = {}) {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  const [y, m, d] = parts(iso)
  const name = DAY_NAMES[weekday(iso)]
  if (weekdayOnly && diff > 1 && diff < 7) return name
  return `${name} ${d} ${MONTH_NAMES[m - 1]}${y !== parts(today)[0] ? ` ${y}` : ''}`
}
/** "9am", "2:30pm", "noon", "midnight". */
export function speakTime(hhmm) {
  if (!hhmm) return ''
  const [h, mi] = hhmm.split(':').map(Number)
  if (h === 12 && mi === 0) return 'noon'
  if (h === 0 && mi === 0) return 'midnight'
  const ap = h < 12 ? 'am' : 'pm'
  const hh = h % 12 || 12
  return mi ? `${hh}:${pad(mi)}${ap}` : `${hh}${ap}`
}
