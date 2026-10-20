// Tasklists — pure list logic, ported from ~/Projects/listicles (app.js). No DOM, no fetch.
//
// An item is { id, text, createdAt, done, doneAt?, priority?, parked? }. `priority` is 'medium' or
// 'high' (absent = low). Ticked items vanish from view a day after being ticked but stay stored.

export const HIDE_DONE_AFTER_MS = 24 * 60 * 60 * 1000
export const PRIORITIES = ['low', 'medium', 'high']

const newId = () => Math.random().toString(36).slice(2, 10)

export const priorityOf = (item) => item.priority || 'low'

/** Items that have been done for more than a day are hidden from the list. */
export const isVisible = (item, now = Date.now()) => !item.done || now - (item.doneAt || 0) < HIDE_DONE_AFTER_MS

/** Open items newest first, then ticked items, most recently ticked first. */
export function displayOrder(items) {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.done) return (b.doneAt || 0) - (a.doneAt || 0)
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

/** What to show: the open list and the parked list, each in display order. */
export function split(items, now = Date.now()) {
  const visible = items.filter((it) => isVisible(it, now))
  return {
    open: displayOrder(visible.filter((it) => !it.parked)),
    parked: displayOrder(visible.filter((it) => it.parked)),
  }
}

export const addItem = (items, text, now = Date.now()) => [...items, { id: newId(), text, done: false, createdAt: now }]

export const toggle = (items, id, now = Date.now()) => items.map((it) => {
  if (it.id !== id) return it
  const { doneAt: _drop, ...rest } = it
  return it.done ? { ...rest, done: false } : { ...rest, done: true, doneAt: now }
})

export const cyclePriority = (items, id) => items.map((it) => {
  if (it.id !== id) return it
  const next = PRIORITIES[(PRIORITIES.indexOf(priorityOf(it)) + 1) % PRIORITIES.length]
  const { priority: _drop, ...rest } = it
  return next === 'low' ? rest : { ...rest, priority: next }
})

export const setParked = (items, id, parked) => items.map((it) => {
  if (it.id !== id) return it
  const { parked: _drop, ...rest } = it
  return parked ? { ...rest, parked: true } : rest
})

export const remove = (items, id) => items.filter((it) => it.id !== id)

/** Counts for the index page: open (not done, not parked) and parked. */
export function summary(items, now = Date.now()) {
  const { open, parked } = split(items, now)
  return { open: open.filter((it) => !it.done).length, parked: parked.length }
}
