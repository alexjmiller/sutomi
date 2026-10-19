// Event Horizon — the calendar. One occurrences hook, two cameras over it (month grid, agenda),
// a detail panel for one item and its chain. The substrate has done all the expansion; this is layout.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DateTime } from 'luxon'
import * as api from './api'
import {
  CATEGORIES, instanceTag, nodeId, isAnchor, isChainTask, isBand, isBankHoliday, isTransparent, isBirthday, ageOn, hasTag,
  startOf, endOf, fmtTime, fmtDay, fmtMonth, whenText, monthGrid, horizon, beyondHorizon, tintFor, byDay, sortByStart, dedupe,
} from './time'
import { SpaceBar } from './SpaceBar'

const monthKey = (dt) => dt.toFormat('yyyy-LL')
const CELL_MAX = 6 // chips per day cell before "+N more"
const utcIso = (dt) => dt.toUTC().toISO()

/** Pages GET /events for whole months and caches them; views read from the cache. */
function useOccurrences() {
  const cache = useRef(new Map())
  const [version, bump] = useReducer((x) => x + 1, 0)
  const [loading, setLoading] = useState(0)
  const [error, setError] = useState(null)
  const [generation, setGeneration] = useState(0) // bumps when the cache is thrown away, so views refetch

  const ensure = useCallback(async (keys) => {
    const missing = keys.filter((k) => !cache.current.has(k))
    if (!missing.length) return
    missing.forEach((k) => cache.current.set(k, []))
    setLoading((n) => n + 1)
    try {
      await Promise.all(missing.map(async (k) => {
        const m = DateTime.fromISO(`${k}-01`, { zone: 'utc' })
        const items = await api.fetchAll({ from: utcIso(m.minus({ days: 1 })), to: utcIso(m.plus({ months: 1, days: 1 })), limit: 100 })
        cache.current.set(k, items)
      }))
      setError(null)
    } catch (e) {
      missing.forEach((k) => cache.current.delete(k))
      setError(e.message)
    } finally {
      setLoading((n) => n - 1)
      bump()
    }
  }, [])

  const itemsFor = useCallback((keys) => dedupe(keys.flatMap((k) => cache.current.get(k) || [])), [])
  const patch = useCallback((eventId, fn) => {
    for (const [k, arr] of cache.current) cache.current.set(k, arr.map((it) => (it.event_id === eventId ? fn(it) : it)))
    bump()
  }, [])
  const reset = useCallback(() => { cache.current.clear(); setGeneration((g) => g + 1) }, [])

  return { ensure, itemsFor, patch, reset, loading: loading > 0, error, version, generation }
}

/** Birth years for birthday series (from the series start_date), fetched once per series. */
function useBirthYears(items) {
  const cache = useRef(new Map())
  const [version, bump] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const ids = [...new Set(items.filter(isBirthday).map((it) => it.event_id))].filter((id) => !cache.current.has(id))
    if (!ids.length) return
    ids.forEach((id) => cache.current.set(id, null))
    Promise.all(ids.map((id) => api.getEvent(id)
      .then((d) => { const y = d.start_date ? Number(d.start_date.slice(0, 4)) : NaN; cache.current.set(id, Number.isFinite(y) ? y : null) })
      .catch(() => cache.current.set(id, null)))).then(bump)
  }, [items])
  return useCallback((item) => (isBirthday(item) ? ageOn(item, cache.current.get(item.event_id) ?? null) : null), [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

function useNodes() {
  const [nodes, setNodes] = useState(() => new Map())
  useEffect(() => {
    api.getNodes().then(({ items }) => setNodes(new Map(items.map((n) => [n.id, n])))).catch(() => {})
  }, [])
  return nodes
}

function useWide(px = 900) {
  const [wide, setWide] = useState(() => window.matchMedia(`(min-width: ${px}px)`).matches)
  useEffect(() => {
    const m = window.matchMedia(`(min-width: ${px}px)`)
    const h = (e) => setWide(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [px])
  return wide
}

const categoryOf = (item, nodes) => {
  const n = nodeId(item.tags)
  return n ? (nodes.get(n)?.category || 'other') : 'other'
}

export default function Calendar() {
  const [params, setParams] = useSearchParams()
  const wide = useWide()
  const view = params.get('view') || (wide ? 'month' : 'agenda')
  const today = DateTime.now().startOf('day')
  const dateParam = params.get('date')
  const parsed = dateParam ? DateTime.fromISO(dateParam) : null
  const cursor = (parsed?.isValid ? parsed : today).startOf('day')
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState('all')
  const [hideDone, setHideDone] = useState(false)
  const [hideBands, setHideBands] = useState(false)
  const [pages, setPages] = useState(1)
  const [selected, setSelected] = useState(null)
  const [dayOpen, setDayOpen] = useState(null)
  const [problem, setProblem] = useState(null)
  const occ = useOccurrences()
  const nodes = useNodes()

  const setParam = (patch) => {
    const n = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) n.delete(k)
      else n.set(k, v)
    }
    setParams(n)
  }

  const monthStart = cursor.startOf('month')
  const monthIso = monthStart.toISODate()
  const weeks = useMemo(() => monthGrid(monthStart), [monthIso]) // eslint-disable-line react-hooks/exhaustive-deps
  const agendaEnd = cursor.plus({ days: 90 * pages })
  const cursorIso = cursor.toISODate()
  const keys = useMemo(() => {
    const ks = new Set()
    if (view === 'month') for (const d of weeks.flat()) ks.add(d.slice(0, 7))
    else for (let d = cursor.startOf('month'); d <= agendaEnd; d = d.plus({ months: 1 })) ks.add(monthKey(d))
    return [...ks]
  }, [view, weeks, cursorIso, pages]) // eslint-disable-line react-hooks/exhaustive-deps
  const keyList = keys.join(',')
  useEffect(() => { occ.ensure(keys) }, [keyList, occ.generation]) // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => occ.itemsFor(keys), [occ.version, occ.generation, keyList]) // eslint-disable-line react-hooks/exhaustive-deps
  const ageOf = useBirthYears(all)
  const label = useCallback((item) => { const age = ageOf(item); return age == null ? item.title : `${item.title} · ${age}` }, [ageOf])
  const visible = useMemo(() => all.filter((it) => {
    if (filter === 'tasks' && !it.is_task) return false
    if (filter === 'events' && (it.is_task || isTransparent(it))) return false
    if (filter === 'info' && !isTransparent(it)) return false
    if (hideDone && it.completed_at) return false
    if (hideBands && (isBand(it) || isBankHoliday(it))) return false
    if (category !== 'all' && categoryOf(it, nodes) !== category) return false
    return true
  }), [all, filter, hideDone, hideBands, category, nodes])

  const selectedItem = selected ? all.find((it) => it.occurrence_id === selected) : null

  async function toggleDone(it) {
    const next = it.completed_at ? null : new Date().toISOString()
    occ.patch(it.event_id, (x) => ({ ...x, completed_at: next }))
    try {
      await api.setCompleted(it.event_id, next)
      setProblem(null)
    } catch (e) {
      occ.patch(it.event_id, (x) => ({ ...x, completed_at: it.completed_at }))
      setProblem(`couldn't save that: ${e.message}`)
    }
  }

  function go(dir) {
    if (view === 'month') setParam({ date: monthStart.plus({ months: dir }).toISODate() })
    else { setParam({ date: cursor.plus({ months: dir }).toISODate() }); setPages(1) }
  }

  const panel = selectedItem
    ? <ItemDetail item={selectedItem} nodes={nodes} label={label} onClose={() => setSelected(null)} onToggle={toggleDone} onRemoved={() => { setSelected(null); occ.reset() }} />
    : dayOpen
      ? <DayList iso={dayOpen} items={(byDay(visible).get(dayOpen) || [])} label={label} onSelect={setSelected} onToggle={toggleDone} onClose={() => setDayOpen(null)} />
      : null

  return (
    <main className="page eh eh-cal">
      <div className="eh-top">
        <Link to="/tools/eventhorizon" className="back-link">&lt; event horizon</Link>
        <div className="eh-views" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'month'} className={`eh-tab${view === 'month' ? ' active' : ''}`} onClick={() => setParam({ view: 'month' })}>month</button>
          <button type="button" role="tab" aria-selected={view === 'agenda'} className={`eh-tab${view === 'agenda' ? ' active' : ''}`} onClick={() => setParam({ view: 'agenda' })}>list</button>
        </div>
      </div>

      <SpaceBar space={api.getSpace()} />
      <div className="eh-toolbar">
        <button type="button" className="eh-btn eh-arrow" onClick={() => go(-1)} aria-label="previous">&lt;</button>
        <h2 className="eh-month">{view === 'month' ? fmtMonth(monthStart) : `from ${fmtDay(cursor)}`}</h2>
        <button type="button" className="eh-btn eh-arrow" onClick={() => go(1)} aria-label="next">&gt;</button>
        {!cursor.hasSame(today, view === 'month' ? 'month' : 'day') && (
          <button type="button" className="eh-text-btn" onClick={() => { setParam({ date: null }); setPages(1) }}>today</button>
        )}
      </div>

      <div className="eh-filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="show">
          <option value="all">everything</option>
          <option value="tasks">to do</option>
          <option value="events">events</option>
          <option value="info">information</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="kind">
          <option value="all">all kinds</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="other">other</option>
        </select>
        <label className="eh-checklabel"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> hide completed</label>
        <label className="eh-checklabel"><input type="checkbox" checked={hideBands} onChange={(e) => setHideBands(e.target.checked)} /> hide terms &amp; bank holidays</label>
        {occ.loading && <span className="eh-muted">loading…</span>}
        {(occ.error || problem) && <span className="eh-problem">{occ.error || problem}</span>}
      </div>

      <div className={`eh-cal-body${panel ? ' with-panel' : ''}`}>
        {view === 'month'
          ? <MonthGrid weeks={weeks} monthStart={monthStart} items={visible} today={today} wide={wide} label={label} onSelect={setSelected} onDay={setDayOpen} onToggle={toggleDone} />
          : <Agenda cursor={cursor} end={agendaEnd} items={visible} today={today} label={label} onSelect={setSelected} onToggle={toggleDone} onMore={() => setPages(pages + 1)} />}
        {panel && <aside className="eh-panel">{panel}</aside>}
      </div>
    </main>
  )
}

function Check({ item, onToggle }) {
  return (
    <button
      type="button"
      className={`eh-check${item.completed_at ? ' done' : ''}`}
      role="checkbox"
      aria-checked={Boolean(item.completed_at)}
      aria-label={item.completed_at ? `reopen: ${item.title}` : `complete: ${item.title}`}
      onClick={(e) => { e.stopPropagation(); onToggle(item) }}
    >
      {item.completed_at ? '✓' : ''}
    </button>
  )
}

function itemClass(item) {
  const tag = instanceTag(item.tags)
  return [
    tag ? 'tinted' : '',
    isAnchor(item) ? 'anchor' : '',
    item.is_task ? 'task' : '',
    item.completed_at ? 'done' : '',
    item.time_type === 'timed' ? 'timed' : '',
    isTransparent(item) ? 'transparent' : '',
  ].filter(Boolean).join(' ')
}

/** A background band for a period (school term, holiday…): a tint across its days, named only where it starts. */
function Band({ item, iso }) {
  const first = startOf(item).toISODate() === iso
  if (!first) return null
  return <div className={`eh-band${hasTag(item, 'school:holiday') || hasTag(item, 'holiday') ? ' holiday' : ''}`} title={item.title}>{item.title} begins</div>
}

/** Local or re-imported data can hold the same period twice; one band per title and start is enough. */
function uniqueBands(items) {
  const seen = new Set()
  return items.filter((it) => { const k = `${it.title}|${it.starts_at}`; return seen.has(k) ? false : (seen.add(k), true) })
}
const itemStyle = (item) => {
  const tag = instanceTag(item.tags)
  return tag ? { '--tint': tintFor(tag) } : undefined
}

function MonthGrid({ weeks, monthStart, items, today, wide, label, onSelect, onDay, onToggle }) {
  const map = byDay(items)
  const beyond = beyondHorizon(monthStart) && beyondHorizon(monthStart.endOf('month'))
  const todayIso = today.toISODate()
  return (
    <div className="eh-month-wrap">
      {beyond && <p className="eh-beyond">beyond the horizon — the map reaches about 18 months ahead and a month back</p>}
      <div className="eh-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="eh-dow">{d}</div>)}
        {weeks.flat().map((iso) => {
          const d = DateTime.fromISO(iso)
          const all = map.get(iso) || []
          const bands = uniqueBands(all.filter(isBand))
          const its = all.filter((it) => !isBand(it))
          const cls = `eh-cell${d.month !== monthStart.month ? ' other' : ''}${iso === todayIso ? ' today' : ''}${bands.some((b) => hasTag(b, 'school:holiday')) ? ' in-holiday' : bands.length ? ' in-term' : ''}`
          if (!wide) {
            return (
              <button type="button" key={iso} className={cls} onClick={() => onDay(iso)} aria-label={`${fmtDay(d)}, ${its.length} items`}>
                <span className="eh-daynum">{d.day}</span>
                {its.length > 0 && (
                  <span className="eh-dots">
                    {its.slice(0, 4).map((it) => <i key={it.occurrence_id} style={{ background: instanceTag(it.tags) ? tintFor(instanceTag(it.tags)) : '#46413d' }} />)}
                    {its.length > 4 && <b>+{its.length - 4}</b>}
                  </span>
                )}
              </button>
            )
          }
          const shown = its.length > CELL_MAX ? its.slice(0, CELL_MAX - 1) : its
          return (
            <div key={iso} className={cls}>
              <button type="button" className="eh-daynum eh-daybtn" onClick={() => onDay(iso)} aria-label={`${fmtDay(d)}: see the day`}>{d.day}</button>
              {bands.map((b) => <Band key={b.occurrence_id} item={b} iso={iso} />)}
              {shown.map((it) => {
                const s = startOf(it)
                const continuing = it.time_type === 'all_day' && s.toISODate() !== iso
                return (
                  <div key={it.occurrence_id} className={`eh-chip ${itemClass(it)}`} style={itemStyle(it)}>
                    {it.is_task && <Check item={it} onToggle={onToggle} />}
                    <button type="button" className="eh-chip-main" onClick={() => onSelect(it.occurrence_id)} title={label(it)}>
                      {it.time_type === 'timed' && <span className="eh-time">{fmtTime(s)}</span>}
                      <span className="eh-chip-title">{continuing ? '… ' : ''}{label(it)}</span>
                    </button>
                  </div>
                )
              })}
              {shown.length < its.length && (
                <button type="button" className="eh-more" onClick={() => onDay(iso)}>+{its.length - shown.length} more</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Row({ item, label, onSelect, onToggle }) {
  const s = startOf(item)
  const e = endOf(item)
  let when = 'all day'
  if (item.time_type === 'timed') when = `${fmtTime(s)}–${fmtTime(e)}`
  else if (!e.minus({ days: 1 }).hasSame(s, 'day')) when = `until ${fmtDay(e.minus({ days: 1 }))}`
  if (isBand(item)) return <div className="eh-band-row">{item.title} <span className="eh-muted">· {when}</span></div>
  return (
    <div className={`eh-row-item ${itemClass(item)}`} style={itemStyle(item)}>
      {item.is_task ? <Check item={item} onToggle={onToggle} /> : <span className="eh-check-space" />}
      <button type="button" className="eh-row-main" onClick={() => onSelect(item.occurrence_id)}>
        <span className="eh-row-title">{label(item)}</span>
        <span className="eh-muted">{when}</span>
      </button>
    </div>
  )
}

function Agenda({ cursor, end, items, today, label, onSelect, onToggle, onMore }) {
  const map = byDay(items)
  const startIso = cursor.toISODate()
  const days = []
  for (let d = cursor; d <= end; d = d.plus({ days: 1 })) {
    const iso = d.toISODate()
    const here = (map.get(iso) || []).filter((it) => startOf(it).toISODate() === iso || iso === startIso)
    const its = [...uniqueBands(here.filter(isBand)), ...here.filter((it) => !isBand(it))]
    if (its.length) days.push([iso, its])
  }
  const h = horizon()
  const todayIso = today.toISODate()
  return (
    <div className="eh-agenda">
      {!days.length && <p className="eh-muted">nothing in this stretch</p>}
      {days.map(([iso, its]) => (
        <section key={iso} className="eh-day">
          <h3 className={`eh-day-h${iso === todayIso ? ' today' : ''}`}>{fmtDay(DateTime.fromISO(iso))}{iso === todayIso ? ' · today' : ''}</h3>
          <ul className="eh-day-list">
            {its.map((it) => <li key={it.occurrence_id}><Row item={it} label={label} onSelect={onSelect} onToggle={onToggle} /></li>)}
          </ul>
        </section>
      ))}
      {end < h.to
        ? <button type="button" className="eh-btn" onClick={onMore}>show the next 90 days</button>
        : <p className="eh-beyond">beyond the horizon — the map reaches about 18 months ahead</p>}
    </div>
  )
}

/** One day: what needs doing, what's on, and the background information, kept apart. */
function DayList({ iso, items, label, onSelect, onToggle, onClose }) {
  const groups = [
    ['to do', items.filter((it) => it.is_task)],
    ['on this day', items.filter((it) => !it.is_task && !isTransparent(it))],
    ['information', [...uniqueBands(items.filter(isBand)), ...items.filter((it) => isTransparent(it) && !isBand(it))]],
  ].filter(([, list]) => list.length)
  return (
    <div className="eh-detail">
      <div className="eh-detail-top">
        <h3 className="eh-h">{fmtDay(DateTime.fromISO(iso))}</h3>
        <button type="button" className="eh-x" aria-label="close" onClick={onClose}>×</button>
      </div>
      {!items.length && <p className="eh-muted">nothing on this day</p>}
      {groups.map(([name, list]) => (
        <section key={name} className="eh-day-group">
          <h4 className="eh-h">{name}</h4>
          <ul className="eh-day-list">
            {list.map((it) => <li key={it.occurrence_id}><Row item={it} label={label} onSelect={onSelect} onToggle={onToggle} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** One item: when, what, its tags; for chain items the whole chain as a timeline with the anchor marked. */
function ItemDetail({ item, nodes, label, onClose, onToggle, onRemoved }) {
  const tag = instanceTag(item.tags)
  const node = nodes.get(nodeId(item.tags))
  const [chain, setChain] = useState(null)
  const [detail, setDetail] = useState(null)
  const [problem, setProblem] = useState(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let on = true
    setChain(null)
    setDetail(null)
    setProblem(null)
    if (tag) {
      const h = horizon()
      api.fetchAll({ tags: tag, from: utcIso(h.from), to: utcIso(h.to), limit: 100 })
        .then((items) => on && setChain(sortByStart(items)))
        .catch((e) => on && setProblem(e.message))
    }
    if (isAnchor(item)) api.getEvent(item.event_id).then((d) => on && setDetail(d)).catch(() => {})
    return () => { on = false }
  }, [item.occurrence_id, tag]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the timeline in step with optimistic completes.
  const toggle = async (it) => {
    setChain((c) => c && c.map((x) => (x.event_id === it.event_id ? { ...x, completed_at: it.completed_at ? null : new Date().toISOString() } : x)))
    await onToggle(it)
  }

  const anchor = chain?.find(isAnchor)
  const openTasks = chain ? chain.filter((x) => isChainTask(x) && !x.completed_at).length : 0
  const slots = detail?.metadata?.ehn?.slots

  async function remove() {
    const name = anchor?.title || item.title
    if (!window.confirm(`Remove "${name}" and its ${openTasks} open task${openTasks === 1 ? '' : 's'} from the map? Completed tasks are kept.`)) return
    setRemoving(true)
    try {
      await api.removeInstance(tag)
      onRemoved()
    } catch (e) {
      setProblem(e.message)
      setRemoving(false)
    }
  }

  return (
    <div className="eh-detail">
      <div className="eh-detail-top">
        <h3 className={`eh-h${isAnchor(item) ? ' anchor' : ''}`} style={itemStyle(item)}>{label(item)}</h3>
        <button type="button" className="eh-x" aria-label="close" onClick={onClose}>×</button>
      </div>
      <p className="eh-when">{whenText(item)}</p>
      {item.is_task && (
        <p className="eh-task-line">
          <Check item={item} onToggle={toggle} /> {item.completed_at ? `completed ${fmtDay(DateTime.fromISO(item.completed_at))}` : 'to do'}
        </p>
      )}
      {isTransparent(item) && <p className="eh-muted">{isBand(item) ? 'a background band — ' : ''}doesn't block the day</p>}
      {item.description && <p className="eh-desc">{item.description}</p>}
      {item.location && <p className="eh-muted">{item.location}</p>}
      {node && <p className="eh-muted">{node.name} · {node.category}{isChainTask(item) && anchor ? ` · part of "${anchor.title}"` : ''}</p>}
      {item.detached && <p className="eh-muted">edited by hand — no longer kept in step with its chain</p>}
      {slots && (
        <ul className="eh-slots">
          {Object.entries(slots).map(([k, v]) => <li key={k}><span className="eh-muted">{k}:</span> {v}</li>)}
        </ul>
      )}
      {item.tags.filter((t) => !t.startsWith('ehn:')).length > 0 && (
        <p className="eh-tags">{item.tags.filter((t) => !t.startsWith('ehn:')).join(' · ')}</p>
      )}

      {tag && (
        <section className="eh-chain">
          <h4 className="eh-h">the chain</h4>
          {!chain && !problem && <p className="eh-muted">loading…</p>}
          {chain && (
            <ol className="eh-timeline">
              {chain.map((x) => (
                <li key={x.occurrence_id} className={`eh-tl ${itemClass(x)}${x.occurrence_id === item.occurrence_id ? ' current' : ''}`} style={itemStyle(x)}>
                  {x.is_task ? <Check item={x} onToggle={toggle} /> : <span className="eh-check-space" />}
                  <span className="eh-tl-date">{fmtDay(startOf(x))}</span>
                  <span className="eh-tl-title">{x.title}{isAnchor(x) ? ' · the event' : ''}</span>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="eh-text-btn eh-danger" disabled={removing || !chain} onClick={remove}>
            {removing ? 'removing…' : 'remove this whole chain'}
          </button>
        </section>
      )}
      {problem && <p className="eh-problem">{problem}</p>}
    </div>
  )
}
