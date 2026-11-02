// Event Horizon — birthdays. Everyone whose birthday is on the map, over the coming year: when it is,
// how old they turn, and whether you are celebrating (a chain of present/card/plans tasks) or just
// remembering the date. One occurrences query plus one read per series for the birth date and
// involvement; no local data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DateTime } from 'luxon'
import * as api from './api'
import { fmtDay, fmtShortDay, spellIso } from './time'
import { SpaceBar } from './SpaceBar'
import { buildPeople, byMonth, awayText, tally } from './people'

const utcIso = (dt) => dt.toUTC().toISO()

/** Birthday occurrences for the year ahead, then each series' authored event as the details arrive. */
function useBirthdays() {
  const [items, setItems] = useState(null)
  const [details, setDetails] = useState(() => new Map())
  const [error, setError] = useState(null)
  const [generation, setGeneration] = useState(0)
  const fetched = useRef(new Set())

  useEffect(() => {
    let on = true
    const start = DateTime.utc().startOf('day')
    api.fetchAll({ tags: 'birthday', kind: 'event', from: utcIso(start), to: utcIso(start.plus({ years: 1 })), limit: 100 })
      .then((list) => { if (on) { setItems(list); setError(null) } })
      .catch((e) => on && setError(e.message))
    return () => { on = false }
  }, [generation])

  useEffect(() => {
    if (!items) return
    let on = true
    const ids = [...new Set(items.map((it) => it.event_id))].filter((id) => !fetched.current.has(id))
    if (!ids.length) return
    ids.forEach((id) => fetched.current.add(id))
    Promise.all(ids.map((id) => api.getEvent(id).then((d) => [id, d]).catch(() => { fetched.current.delete(id); return null })))
      .then((pairs) => on && setDetails((m) => { const n = new Map(m); for (const p of pairs) if (p) n.set(p[0], p[1]); return n }))
    return () => { on = false }
  }, [items])

  const reload = useCallback(() => setGeneration((g) => g + 1), [])
  return { items, details, error, reload }
}

const INVOLVEMENT_TEXT = {
  celebrate: 'celebrate — present, card and plans as tasks',
  remember: 'remember — just the date, no tasks',
}

export default function Birthdays() {
  const { items, details, error, reload } = useBirthdays()
  const [filter, setFilter] = useState('all') // all | celebrate | remember

  // Added by Siri or on another device: refresh when the page comes back into view.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [reload])

  const rows = useMemo(() => (items ? buildPeople(items, details) : []), [items, details])
  const counts = useMemo(() => tally(rows), [rows])
  const shown = filter === 'all' ? rows : rows.filter((r) => r.involvement === filter)
  const groups = byMonth(shown)
  const hasInvolvement = counts.celebrate + counts.remember > 0
  const today = DateTime.utc().startOf('day')
  const until = today.plus({ years: 1 }).minus({ days: 1 })

  return (
    <main className="page eh eh-bdays">
      <div className="eh-top">
        <Link to="/tools/eventhorizon" className="back-link">&lt; event horizon</Link>
        <div className="eh-views" role="tablist">
          <Link to="/tools/eventhorizon/calendar?view=month" className="eh-tab">month</Link>
          <Link to="/tools/eventhorizon/calendar?view=agenda" className="eh-tab">list</Link>
          <span role="tab" aria-selected="true" className="eh-tab active">birthdays</span>
        </div>
      </div>

      <SpaceBar space={api.getSpace()} />
      <div className="eh-toolbar">
        <h2 className="eh-month">birthdays</h2>
        <span className="eh-muted">{fmtDay(today)} – {fmtDay(until)}</span>
      </div>

      <p className="eh-bday-tally">
        {items == null && !error && 'loading…'}
        {items && counts.total === 0 && 'no birthdays on the map yet'}
        {counts.total > 0 && (
          <>
            {counts.total} birthday{counts.total === 1 ? '' : 's'} over the year
            {hasInvolvement && <> · {counts.celebrate} to celebrate · {counts.remember} to remember</>}
            {counts.own > 0 && <> · {counts.own === 1 ? 'yours' : `${counts.own} of yours`}</>}
            {counts.unknown > 0 && <> · {counts.unknown} just on the calendar</>}
          </>
        )}
      </p>

      <div className="eh-filters">
        {hasInvolvement && (
          <div className="eh-chips" role="radiogroup" aria-label="show">
            {[['all', 'everyone'], ['celebrate', 'celebrate'], ['remember', 'remember']].map(([k, text]) => (
              <button key={k} type="button" role="radio" aria-checked={filter === k} className={`eh-chipbtn${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{text}</button>
            ))}
          </div>
        )}
        <Link to="/tools/eventhorizon/interview/node/birthday" className="eh-text-btn">+ add a birthday</Link>
        {error && <span className="eh-problem">{error}</span>}
      </div>

      {items && counts.total > 0 && shown.length === 0 && <p className="eh-muted">nobody in this group</p>}
      {groups.map((g) => (
        <section key={g.key} className="eh-bday-month">
          <h3 className="eh-h">{g.label}</h3>
          <ul className="eh-bday-list">
            {g.rows.map((r) => <li key={r.id}><Person row={r} /></li>)}
          </ul>
        </section>
      ))}
    </main>
  )
}

function Person({ row: r }) {
  const soon = r.daysAway >= 0 && r.daysAway <= 7
  return (
    <div className={`eh-bday${soon ? ' soon' : ''}${r.dup ? ' dup' : ''}`}>
      <div className="eh-bday-main">
        <Link to={`/tools/eventhorizon/calendar?view=agenda&date=${r.nextIso}`} className="eh-bday-name" title={`see ${fmtShortDay(r.next)} on the map`}>{r.name}</Link>
        {r.turns != null && <span className="eh-bday-age">turns {r.turns}</span>}
        {r.own
          ? <span className="eh-badge own">you</span>
          : r.involvement
            ? <span className={`eh-badge ${r.involvement}`} title={INVOLVEMENT_TEXT[r.involvement]}>{r.involvement}</span>
            : r.loaded && <span className="eh-badge plain">on the calendar</span>}
      </div>
      <div className="eh-bday-when">
        <span className={soon ? 'eh-bday-soon' : ''}>{fmtShortDay(r.next)} · {awayText(r.daysAway)}</span>
        <span className="eh-muted">
          {r.born ? ` · born ${spellIso(r.born)}` : r.loaded ? ' · year of birth not known' : ''}
        </span>
        {r.dup && <span className="eh-problem"> · added more than once</span>}
      </div>
    </div>
  )
}
