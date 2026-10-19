// Event Horizon — pure time and tag helpers. Luxon does the zone maths; nothing here touches the DOM.
import { DateTime } from 'luxon'

export const CATEGORIES = ['personal', 'administrative', 'financial', 'health', 'life', 'disruption']
const INSTANCE_TAG = /^ehn:[a-z0-9-]+:[0-9a-f]+$/
const NODE_TAG = /^ehn:([a-z0-9-]+)$/

export const instanceTag = (tags = []) => tags.find((t) => INSTANCE_TAG.test(t)) || null
export function nodeId(tags = []) {
  for (const t of tags) {
    const m = NODE_TAG.exec(t)
    if (m && m[1] !== 'task') return m[1]
  }
  return null
}
export const isChainTask = (item) => Boolean(item.tags?.includes('ehn:task'))
export const hasTag = (item, tag) => Boolean(item.tags?.includes(tag))
/** Background bands (school terms and the like): drawn across days, never listed. */
export const isBand = (item) => hasTag(item, 'period')
export const isBankHoliday = (item) => hasTag(item, 'bank-holiday')
/** Non-blocking: never a conflict. */
export const isTransparent = (item) => hasTag(item, 'transparent')
/** A birthday occurrence whose series start may be the date of birth (own, or an ontology anchor). */
export const isBirthday = (item) => hasTag(item, 'birthday') && !item.is_task && !isChainTask(item)
/** Age on this occurrence, or null when the birth year is unknown (start year is this year or later). */
export function ageOn(item, birthYear, now = DateTime.now()) {
  if (birthYear == null || birthYear >= now.year) return null
  return startOf(item).year - birthYear
}
export const isAnchor = (item) => Boolean(instanceTag(item.tags)) && !isChainTask(item)

// Time rules: all-day items live on their UTC date and are never shifted into the viewer's zone;
// timed items are converted to the viewer's zone. Ends are exclusive.
export const startOf = (item) => (item.time_type === 'all_day'
  ? DateTime.fromISO(item.starts_at, { zone: 'utc' })
  : DateTime.fromISO(item.starts_at).setZone('local'))
export const endOf = (item) => (item.time_type === 'all_day'
  ? DateTime.fromISO(item.ends_at, { zone: 'utc' })
  : DateTime.fromISO(item.ends_at).setZone('local'))

const gb = (dt) => dt.setLocale('en-GB')
export const fmtDay = (dt) => gb(dt).toFormat('ccc d LLL yyyy')
export const fmtShortDay = (dt) => gb(dt).toFormat('ccc d LLL')
export const fmtTime = (dt) => gb(dt).toFormat('HH:mm')
export const fmtMonth = (dt) => gb(dt).toFormat('LLLL yyyy')
export const fmtIsoDate = (iso) => (iso ? fmtDay(DateTime.fromISO(iso)) : '')
/** "26 March 2026" — the spelled form the interview service reads back without ambiguity. */
export const spellIso = (iso) => (iso ? gb(DateTime.fromISO(iso)).toFormat('d MMMM yyyy') : '')

/** "Tue 3 Mar 2027", "Sat 20 Dec 2026 – Fri 2 Jan 2027" or "Tue 3 Mar 2027, 10:00–11:30". */
export function whenText(item) {
  const s = startOf(item)
  const e = endOf(item)
  if (item.time_type === 'all_day') {
    const last = e.minus({ days: 1 })
    return last.hasSame(s, 'day') ? fmtDay(s) : `${fmtDay(s)} – ${fmtDay(last)}`
  }
  const sameDay = e.hasSame(s, 'day')
  return `${fmtDay(s)}, ${fmtTime(s)}–${sameDay ? '' : `${fmtDay(e)} `}${fmtTime(e)}`
}

/** ISO dates an item covers, capped so a long stay can't flood a grid. */
export function itemDays(item, cap = 93) {
  const first = startOf(item).startOf('day')
  const last = endOf(item).minus(item.time_type === 'all_day' ? { days: 1 } : { milliseconds: 1 }).startOf('day')
  const days = []
  for (let d = first; d <= last && days.length < cap; d = d.plus({ days: 1 })) days.push(d.toISODate())
  if (!days.length) days.push(first.toISODate())
  return days
}

/** Monday-first month grid: whole weeks (seven ISO dates each) covering the month. */
export function monthGrid(monthStart) {
  const first = monthStart.startOf('month')
  const gridStart = first.minus({ days: first.weekday - 1 })
  const last = first.endOf('month').startOf('day')
  const gridEnd = last.plus({ days: 8 - last.weekday })
  const weeks = []
  for (let d = gridStart; d < gridEnd; d = d.plus({ weeks: 1 })) {
    weeks.push(Array.from({ length: 7 }, (_, i) => d.plus({ days: i }).toISODate()))
  }
  return weeks
}

/** The substrate only materializes roughly now−1 month to now+18 months. */
export function horizon(now = DateTime.now()) {
  return { from: now.minus({ months: 1 }).startOf('month'), to: now.plus({ months: 18 }).endOf('month') }
}
export function beyondHorizon(dt, now = DateTime.now()) {
  const h = horizon(now)
  return dt < h.from || dt > h.to
}

/** A stable tint per instance so an anchor and its chain read as one thing. */
export function tintFor(tag) {
  let h = 0
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 45% 40%)`
}

/** All-day before timed, the events themselves before tasks, then by start; ties by title. */
export function sortByStart(items) {
  const rank = (it) => (it.time_type === 'all_day' ? 0 : 2) + (isAnchor(it) ? 0 : 1)
  return [...items].sort((a, b) => rank(a) - rank(b) || startOf(a) - startOf(b) || a.title.localeCompare(b.title))
}

/** Items keyed by every ISO day they touch. */
export function byDay(items) {
  const map = new Map()
  for (const it of sortByStart(items)) {
    for (const d of itemDays(it)) {
      if (!map.has(d)) map.set(d, [])
      map.get(d).push(it)
    }
  }
  return map
}

export function dedupe(items) {
  const seen = new Set()
  return items.filter((it) => (seen.has(it.occurrence_id) ? false : (seen.add(it.occurrence_id), true)))
}
