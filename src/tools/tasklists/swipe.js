// Tasklists — swipe a row on a touch screen: right to delete, left to park (or unpark).
// Only pointer events from a touch count (mouse users have the hover buttons). The row carries
// `touch-action: pan-y`, so the browser keeps vertical scrolling and leaves sideways drags to us.
import { useRef, useState } from 'react'

export const SWIPE_COMMIT = 72   // px of travel after which letting go does the action
const SWIPE_MAX = 120            // the row never slides further than this while held
const SWIPE_SLOP = 6             // sideways travel before a touch counts as a swipe, not a tap
const LEAVE_MS = 160             // slide-out time before the action is applied

/** Handlers for the row, the transform for its body, and classes naming the swipe's state.
 *  A side without a handler is inert: the row doesn't move that way. */
export function useSwipe({ onLeft, onRight }) {
  const allowed = (dx) => (dx > 0 ? Boolean(onRight) : Boolean(onLeft))
  const [drag, setDrag] = useState({ dx: 0, held: false })
  const touch = useRef(null)     // { id, x, y, active } for the finger being tracked
  const swiped = useRef(false)   // set once a drag starts, so a click that follows it is ignored

  function onPointerDown(e) {
    swiped.current = false
    if (e.pointerType !== 'touch' || !e.isPrimary) return
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false }
  }

  function onPointerMove(e) {
    const t = touch.current
    if (!t || e.pointerId !== t.id) return
    const dx = e.clientX - t.x
    if (!t.active) {
      if (Math.abs(dx) < SWIPE_SLOP) return
      if (Math.abs(e.clientY - t.y) > Math.abs(dx)) { touch.current = null; return } // a scroll, not a swipe
      t.active = true
      swiped.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    setDrag({ dx: allowed(dx) ? Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx)) : 0, held: true })
  }

  function onPointerUp(e) {
    const t = touch.current
    if (!t || e.pointerId !== t.id) return
    touch.current = null
    if (!t.active) return
    const dx = e.clientX - t.x
    if (Math.abs(dx) < SWIPE_COMMIT || !allowed(dx)) { setDrag({ dx: 0, held: false }); return }
    const width = e.currentTarget.offsetWidth || SWIPE_MAX * 3
    setDrag({ dx: dx > 0 ? width : -width, held: false })           // slide the row out of view…
    setTimeout(() => { setDrag({ dx: 0, held: false }); (dx > 0 ? onRight : onLeft)() }, LEAVE_MS) // …then act
  }

  function onPointerCancel(e) {
    if (touch.current && e.pointerId === touch.current.id) { touch.current = null; setDrag({ dx: 0, held: false }) }
  }

  // A finger lifted at the end of a swipe must not count as a tap on whatever it was over.
  function onClickCapture(e) {
    if (swiped.current) { swiped.current = false; e.stopPropagation(); e.preventDefault() }
  }

  const { dx, held } = drag
  const dir = dx > 0 ? 'right' : dx < 0 ? 'left' : null
  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture },
    style: dx || held ? { transform: `translateX(${dx}px)`, transition: held ? 'none' : `transform ${LEAVE_MS}ms ease` } : undefined,
    className: dir ? ` swiping swipe-${dir}${Math.abs(dx) >= SWIPE_COMMIT ? ' armed' : ''}` : '',
  }
}
