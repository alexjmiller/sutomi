// Tasklists — pure list logic, ported from ~/Projects/listicles (app.js). No DOM, no fetch.
//
// An item is { id, text, createdAt, done, doneAt?, priority?, parked? }. `priority` is 'medium' or
// 'high' (absent = low). Ticked items vanish from view a day after being ticked but stay stored.
// Changes are expressed as ops (server/listops.js) so the server can merge edits from several devices;
// the builders below make the op for each action, and `applyOp` previews it locally.

export { applyOp, applyOps } from '../../../server/listops.js'

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

// Op builders — one per action in llli.st.
export const opAdd = (text, now = Date.now()) => ({ type: 'add', item: { id: newId(), text, done: false, createdAt: now } })
export const opToggle = (item, now = Date.now()) => ({ type: 'set', id: item.id, patch: item.done ? { done: false, doneAt: null } : { done: true, doneAt: now } })
export function opCycle(item) {
  const next = PRIORITIES[(PRIORITIES.indexOf(priorityOf(item)) + 1) % PRIORITIES.length]
  return { type: 'set', id: item.id, patch: { priority: next === 'low' ? null : next } }
}
export const opText = (item, text) => ({ type: 'set', id: item.id, patch: { text } })
export const opPark = (item, parked) => ({ type: 'set', id: item.id, patch: { parked: parked ? true : null } })
export const opRemove = (item) => ({ type: 'remove', id: item.id })

/** Counts for the index page: open (not done, not parked) and parked. */
export function summary(items, now = Date.now()) {
  const { open, parked } = split(items, now)
  return { open: open.filter((it) => !it.done).length, parked: parked.length }
}
