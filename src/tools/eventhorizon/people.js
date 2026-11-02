// Event Horizon — the people whose birthdays are on the map, pure logic (Birthdays.jsx renders it).
// One row per birthday series: when the next one is, how old they turn, and how involved you are
// (celebrate = a chain of tasks, remember = just the date). The substrate knows two shapes: your own
// birthday (tags `birthday`, `personal`, no `ehn:`) and other people's from the birthday node
// (`metadata.ehn.slots.involvement`).
import { DateTime } from 'luxon'
import { instanceTag, isBirthday, startOf, hasTag } from './time.js'

const POSSESSIVE = /['’]s birthday$/i

/** "Pam's birthday" → "Pam"; the node's own person slot wins when it is there. */
export function personName(title, detail) {
  const slot = detail?.metadata?.ehn?.slots?.person
  if (typeof slot === 'string' && slot.trim()) return slot.trim()
  return (title || '').replace(POSSESSIVE, '').trim() || title || 'someone'
}

/**
 * Build the rows. `items` are occurrences (one window of about a year, so a yearly series shows once);
 * `details` maps event_id → the authored event (start_date, metadata) where it has arrived.
 * Returns rows sorted by the next birthday; `dup` marks two series for the same name and day.
 */
export function buildPeople(items, details, now = DateTime.now()) {
  const seen = new Set()
  const rows = []
  for (const it of items) {
    if (!isBirthday(it) || seen.has(it.event_id)) continue
    seen.add(it.event_id)
    const detail = details.get(it.event_id) || null
    const next = startOf(it).startOf('day')
    const birthYear = detail?.start_date ? Number(detail.start_date.slice(0, 4)) : NaN
    const known = Number.isFinite(birthYear) && birthYear < now.year
    const ehn = detail?.metadata?.ehn
    const involvement = ehn?.slots?.involvement
    rows.push({
      id: it.event_id,
      tag: instanceTag(it.tags),
      title: it.title,
      name: personName(it.title, detail),
      next,
      nextIso: next.toISODate(),
      daysAway: Math.round(next.diff(now.toUTC().startOf('day'), 'days').days),
      born: known ? detail.start_date : null,
      turns: known ? next.year - birthYear : null,
      involvement: involvement === 'celebrate' || involvement === 'remember' ? involvement : null,
      own: hasTag(it, 'personal') && !ehn && !instanceTag(it.tags),
      loaded: Boolean(detail),
    })
  }
  rows.sort((a, b) => a.next - b.next || a.name.localeCompare(b.name))
  const key = (r) => `${r.name.toLowerCase()}|${r.next.toFormat('LL-dd')}`
  const counts = new Map()
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) || 0) + 1)
  for (const r of rows) r.dup = counts.get(key(r)) > 1
  return rows
}

/** Rows grouped by calendar month in order: [{ key: '2027-03', label: 'March 2027', rows }]. */
export function byMonth(rows) {
  const groups = []
  for (const r of rows) {
    const k = r.next.toFormat('yyyy-LL')
    let g = groups[groups.length - 1]
    if (!g || g.key !== k) { g = { key: k, label: r.next.setLocale('en-GB').toFormat('LLLL yyyy'), rows: [] }; groups.push(g) }
    g.rows.push(r)
  }
  return groups
}

/** "today", "tomorrow", "in 12 days", "in 3 months". */
export function awayText(days) {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 60) return `in ${days} days`
  const months = Math.round(days / 30.44)
  return `in ${months} month${months === 1 ? '' : 's'}`
}

/** Counts for the header line. */
export function tally(rows) {
  return {
    total: rows.length,
    celebrate: rows.filter((r) => r.involvement === 'celebrate').length,
    remember: rows.filter((r) => r.involvement === 'remember').length,
    own: rows.filter((r) => r.own).length,
    unknown: rows.filter((r) => r.loaded && !r.involvement && !r.own).length,
  }
}
