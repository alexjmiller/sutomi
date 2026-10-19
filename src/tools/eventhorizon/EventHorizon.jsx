// Event Horizon — a camera onto your future map. Home, the node library, the chat interview and
// the calendar. Pure client over the Event Horizon services via sutomi's proxy; no AI, no local data.
import { useEffect, useState } from 'react'
import { Link, Routes, Route, useParams } from 'react-router-dom'
import * as api from './api'
import { CATEGORIES } from './time'
import Interview, { savedSessions } from './Interview'
import Calendar from './Calendar'
import { SpaceBar, SPACE_LABEL } from './SpaceBar'
import './eventhorizon.css'

export default function EventHorizon() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="add" element={<Library mode="add" />} />
      <Route path="happened" element={<Library mode="happened" />} />
      <Route path="interview/script/:id" element={<InterviewRoute kind="script" />} />
      <Route path="interview/node/:id" element={<InterviewRoute kind="node" />} />
      <Route path="calendar" element={<Calendar />} />
    </Routes>
  )
}

function InterviewRoute({ kind }) {
  const { id } = useParams()
  return <Interview key={`${kind}:${id}`} kind={kind} id={id} />
}

function Home() {
  const [space, setSpaceState] = useState(() => api.getSpace())
  const [health, setHealth] = useState(null)
  const [who, setWho] = useState(null)
  const [live, setLive] = useState(null)
  const [saved, setSaved] = useState(() => savedSessions(space))

  useEffect(() => {
    let on = true
    setHealth(null); setWho(null); setLive(null)
    setSaved(savedSessions(space))
    api.health().then((h) => on && setHealth(h)).catch(() => on && setHealth({ interview: 'unreachable', substrate: 'unreachable' }))
    api.whoami().then((w) => on && setWho(w)).catch(() => {})
    api.listInstances().then((r) => on && setLive(r.items.length)).catch(() => on && setLive(null))
    return () => { on = false }
  }, [space])

  function chooseSpace(s) {
    api.setSpace(s)
    setSpaceState(s)
  }

  const down = health && [health.interview !== 'ok' && 'the interview service', health.substrate !== 'ok' && 'the calendar service'].filter(Boolean)

  return (
    <main className="page eh">
      <Link to="/dashboard" className="back-link">&lt; dashboard</Link>
      <p className="eh-intro">
        Your life as a map of predictable future events, each with its preparation chain.
        Say what's coming; it works out what needs doing, and when.
      </p>
      <div className="eh-space-row">
        <SpaceBar space={space} who={who} />
        <div className="eh-space-pick" role="radiogroup" aria-label="space">
          {['default', 'test'].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={space === s} className={`eh-tab${space === s ? ' active' : ''}`}
              disabled={health?.spaces && !health.spaces.includes(s)} onClick={() => chooseSpace(s)}>
              {SPACE_LABEL[s].replace(' space', '')}
            </button>
          ))}
        </div>
      </div>
      {down && down.length > 0 && (
        <p className="eh-problem">Can't reach {down.join(' or ')} right now ({[health.interview, health.substrate].filter((s) => s !== 'ok').join(', ')}).</p>
      )}

      {saved.length > 0 && (
        <section className="eh-section">
          <h3 className="eh-h">unfinished</h3>
          <ul className="eh-entries">
            {saved.map((s) => (
              <li key={s.id}>
                <Link to={`/tools/eventhorizon/interview/${s.kind}/${s.id}`} className="eh-entry-title">{s.name || s.id}</Link>
                <span className="eh-entry-desc">continue where you left off{s.instances ? ` · ${s.instances} on the map so far` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="eh-entries">
        <li>
          <Link to="/tools/eventhorizon/interview/script/onboarding" className="eh-entry-title">build your map</Link>
          <span className="eh-entry-desc">the full walk: people, documents, vehicles, home, money, health</span>
        </li>
        <li>
          <Link to="/tools/eventhorizon/add" className="eh-entry-title">add one thing</Link>
          <span className="eh-entry-desc">a renewal, a deadline, a birthday — one event and its chain</span>
        </li>
        <li>
          <Link to="/tools/eventhorizon/happened" className="eh-entry-title">something's happened</Link>
          <span className="eh-entry-desc">a job loss or a bereavement — a calm, practical recovery chain</span>
        </li>
        <li>
          <Link to="/tools/eventhorizon/calendar" className="eh-entry-title">my map</Link>
          <span className="eh-entry-desc">
            the calendar{live != null ? ` · ${live} ${live === 1 ? 'event' : 'events'} with chains in play` : ''}
          </span>
        </li>
      </ul>
    </main>
  )
}

/** The node library: "add one thing" (everything but disruptions) or "something's happened" (disruptions). */
function Library({ mode }) {
  const [nodes, setNodes] = useState(null)
  const [problem, setProblem] = useState(null)
  useEffect(() => {
    api.getNodes().then((r) => setNodes(r.items)).catch((e) => setProblem(e.message))
  }, [])

  const disruption = mode === 'happened'
  const items = (nodes || []).filter((n) => (n.category === 'disruption') === disruption)
  const categories = CATEGORIES.filter((c) => (c === 'disruption') === disruption && items.some((n) => n.category === c))

  return (
    <main className="page eh">
      <Link to="/tools/eventhorizon" className="back-link">&lt; event horizon</Link>
      <SpaceBar space={api.getSpace()} />
      <p className="eh-intro">
        {disruption
          ? 'Something has changed. Pick what has happened and we will work out the next two weeks and the next three months, one step at a time.'
          : 'Pick one thing that is coming up. A few questions, and its preparation chain goes on your map.'}
      </p>
      {problem && <p className="eh-problem">{problem}</p>}
      {!nodes && !problem && <p className="eh-muted">loading…</p>}
      {categories.map((c) => (
        <section key={c} className="eh-section">
          {!disruption && <h3 className="eh-h">{c}</h3>}
          <ul className="eh-entries">
            {items.filter((n) => n.category === c).map((n) => (
              <li key={n.id}>
                <Link to={`/tools/eventhorizon/interview/node/${n.id}`} className="eh-entry-title">{n.name}</Link>
                <span className="eh-entry-desc">{n.description}</span>
                <span className="eh-muted">{n.steps} step{n.steps === 1 ? '' : 's'} in the chain{n.rrule ? ' · repeats' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
