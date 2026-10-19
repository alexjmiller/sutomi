// Event Horizon — the chat interview. The service asks, the person answers in plain words, and each
// finished event appears on the map beside the conversation. The engine's state is opaque: we store
// it and send it back untouched.
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as api from './api'
import { fmtIsoDate, spellIso } from './time'
import { SpaceBar } from './SpaceBar'

// Sessions are keyed by space so an interview begun in Test can't be committed into Default.
// A run of only what was put aside ("later") is its own session: `later:<script>`.
const PREFIX = 'eh_interview:'
const key = (space, id) => `${PREFIX}${space}:${id}`
const sessionId = (id, deferredOnly) => (deferredOnly ? `later:${id}` : id)

export function loadSession(space, id) {
  try {
    const s = localStorage.getItem(key(space, id)) || (space === 'default' ? localStorage.getItem(PREFIX + id) : null) // pre-space key
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}
function saveSession(space, id, s) {
  try { localStorage.setItem(key(space, id), JSON.stringify(s)) } catch { /* private window etc. */ }
}
export function clearSession(space, id) {
  try {
    localStorage.removeItem(key(space, id))
    if (space === 'default') localStorage.removeItem(PREFIX + id)
  } catch { /* ignore */ }
}
export function savedSessions(space) {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k.startsWith(PREFIX)) continue
      const rest = k.slice(PREFIX.length)
      const [sp, id] = rest.includes(':') ? rest.split(/:(.*)/) : ['default', rest]
      if (sp !== space) continue
      const s = JSON.parse(localStorage.getItem(k))
      if (s && !s.results) out.push({ id: s.id || id, kind: s.kind, name: s.name, instances: s.instances?.length || 0, deferredOnly: !!s.deferredOnly })
    }
  } catch { /* ignore */ }
  return out
}

const stepsText = (i) => (i.steps ? `${i.steps} step${i.steps === 1 ? '' : 's'}` : 'no tasks')

/** "MOT test · the Golf" — a deferred entry's node with whatever was already known. */
export const deferredLabel = (d) => d.nodes.map((n) => n.name).join(', ') + Object.values(d.carried || {}).map((v) => ` · ${v}`).join('')

/** Transcript entries for a new question: section divider, node helper, then the question. */
function contextEntries(prev, q, kind) {
  const entries = []
  if (!q) return entries
  if (kind === 'script' && (!prev || prev.context.section.id !== q.context.section.id)) {
    entries.push({ kind: 'section', title: q.context.section.title, intro: q.context.section.intro })
  }
  if (q.context.node && (!prev || prev.context.node?.id !== q.context.node.id)) {
    entries.push({ kind: 'node', id: q.context.node.id, name: q.context.node.name, description: q.context.node.description })
  }
  entries.push({ kind: 'q', prompt: q.prompt, help: q.help })
  return entries
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

export default function Interview({ kind, id }) {
  const [params] = useSearchParams()
  const deferredOnly = kind === 'script' && params.get('later') === '1' // walk only what was put aside
  const sid = sessionId(id, deferredOnly)
  const [space] = useState(() => api.getSpace())
  const [resumable, setResumable] = useState(() => loadSession(space, sid))
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [mapOpen, setMapOpen] = useState(false)
  const wide = useWide()
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!session && !resumable) start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [session?.transcript.length, busy])

  function apply(s) {
    setSession(s)
    // nothing left to do once committed — or once finished with nothing to commit
    if (s.results || (s.done && !s.instances.length)) clearSession(space, sid)
    else saveSession(space, sid, s)
  }

  async function start() {
    setBusy(true)
    setProblem(null)
    try {
      let name = id
      let intro = null
      if (kind === 'script') {
        const { items } = await api.getScripts()
        const script = items.find((s) => s.id === id)
        if (script) { name = script.name; intro = script.intro }
      }
      const turn = await api.startInterview(kind === 'script' ? { script: id, ...(deferredOnly ? { deferredOnly: true } : {}) } : { node: id })
      if (kind === 'node' && turn.question?.context.node) name = turn.question.context.node.name
      const transcript = deferredOnly
        ? [{ kind: 'intro', text: 'Picking up what you put aside. Anything you still don\'t have to hand can wait again.' }]
        : intro ? [{ kind: 'intro', text: intro }] : []
      transcript.push(...contextEntries(null, turn.question, kind))
      apply({ id, kind, name, deferredOnly, state: turn.state, question: turn.question, done: turn.done, transcript, instances: [], deferred: [], lastAdded: null, results: null })
    } catch (e) {
      setProblem(e.message)
    } finally {
      setBusy(false)
    }
  }

  /** Send an answer — or, with `later`, put the thing being asked about aside and move on. */
  async function send(input, later = false) {
    if (busy || !session?.question) return
    setBusy(true)
    setProblem(null)
    const q = session.question
    try {
      const turn = await api.answer(session.state, input, later)
      const shown = later ? 'later' : input.trim() ? input.trim() : (q.default == null ? 'skip' : showDefault(q))
      const transcript = [...session.transcript, { kind: 'a', text: shown }]
      let instances = session.instances
      let lastAdded = session.lastAdded
      const deferred = turn.deferred || session.deferred || []
      const newlyAside = deferred.slice((session.deferred || []).length)
      if (newlyAside.length) transcript.push({ kind: 'later', text: newlyAside.map(deferredLabel).join(', ') })
      if (turn.error) {
        transcript.push({ kind: 'error', text: turn.error }, { kind: 'q', prompt: turn.question.prompt, help: turn.question.help })
      } else {
        if (turn.added) {
          instances = [...instances, turn.added]
          lastAdded = turn.added.title
          transcript.push({ kind: 'added', title: turn.added.title })
        }
        transcript.push(...contextEntries(q, turn.question, kind))
      }
      apply({ ...session, state: turn.state, question: turn.question, done: turn.done, transcript, instances, deferred, lastAdded })
    } catch (e) {
      setProblem(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function commit(kept) {
    setBusy(true)
    setProblem(null)
    try {
      const { items } = await api.commit(kept)
      apply({ ...session, results: items })
    } catch (e) {
      setProblem(e.message)
    } finally {
      setBusy(false)
    }
  }

  function resume() {
    setSession(resumable)
    setResumable(null)
  }

  function restart() {
    clearSession(space, sid)
    setResumable(null)
    setSession(null)
    setDismissed(new Set())
    start()
  }

  const instances = session?.instances || []
  const deferred = session?.deferred || []
  const map = <MapPanel instances={instances} deferred={deferred} lastAdded={session?.lastAdded} />

  return (
    <main className="page eh">
      <div className="eh-top">
        <Link to="/tools/eventhorizon" className="back-link">&lt; event horizon</Link>
        {session && !session.results && <button type="button" className="eh-text-btn" onClick={restart}>start again</button>}
      </div>
      <SpaceBar space={space} />

      {resumable && !session ? (
        <section className="eh-chat">
          <h2 className="eh-title">{resumable.name}</h2>
          <p className="eh-bot">You were part way through this{resumable.instances.length ? `, with ${resumable.instances.length} on the map` : ''}.</p>
          <div className="eh-actions">
            <button type="button" className="eh-btn primary" onClick={resume}>continue where you left off</button>
            <button type="button" className="eh-btn" onClick={restart}>start again</button>
          </div>
        </section>
      ) : (
        <div className={`eh-interview${wide ? '' : ' narrow'}`}>
          <section className="eh-chat" aria-live="polite">
            {session && <h2 className="eh-title">{session.name}</h2>}
            <Transcript entries={session?.transcript || []} dismissed={dismissed} onDismiss={(i) => setDismissed(new Set([...dismissed, i]))} />
            {busy && <p className="eh-muted eh-thinking">…</p>}
            {problem && (
              <p className="eh-problem">
                {problem}{' '}
                {!session && <button type="button" className="eh-text-btn" onClick={start}>try again</button>}
              </p>
            )}
            {session && !session.done && session.question && !busy && (
              <AnswerInput key={session.transcript.length} question={session.question} onSend={send} onLater={kind === 'script' ? () => send('', true) : null} />
            )}
            {session?.done && !session.results && (
              <Review instances={instances} deferred={deferred} busy={busy} onCommit={commit} />
            )}
            {session?.results && <Results results={session.results} instances={instances} deferred={deferred} />}
            <div ref={bottomRef} />
          </section>
          {wide ? map : (
            <>
              <button type="button" className="eh-map-toggle" onClick={() => setMapOpen(!mapOpen)} aria-expanded={mapOpen}>
                your map · {instances.length}
              </button>
              {mapOpen && <div className="eh-sheet">{map}</div>}
            </>
          )}
        </div>
      )}
    </main>
  )
}

function Transcript({ entries, dismissed, onDismiss }) {
  return (
    <ol className="eh-transcript">
      {entries.map((e, i) => {
        switch (e.kind) {
          case 'intro': return <li key={i} className="eh-intro-text">{e.text}</li>
          case 'section': return (
            <li key={i} className="eh-divider">
              <span>{e.title}</span>
              {e.intro && <p>{e.intro}</p>}
            </li>
          )
          case 'node': return dismissed.has(i) ? null : (
            <li key={i} className="eh-node">
              <strong>{e.name}</strong>
              <p>{e.description}</p>
              <button type="button" className="eh-x" aria-label="dismiss" onClick={() => onDismiss(i)}>×</button>
            </li>
          )
          case 'q': return <li key={i} className="eh-bot">{e.prompt}</li>
          case 'a': return <li key={i} className="eh-user">{e.text}</li>
          case 'error': return <li key={i} className="eh-bot eh-err">{e.text}</li>
          case 'added': return <li key={i} className="eh-added">added to your map: {e.title}</li>
          case 'later': return <li key={i} className="eh-aside">put aside: {e.text}</li>
          default: return null
        }
      })}
    </ol>
  )
}

/** Defaults arrive as YYYY-MM-DD; show dates the way we'd say them. */
const showDefault = (q) => (q.kind === 'date' ? spellIso(q.default) : q.default)

/** Input shaped by the question kind. Sends the text as typed; the service does the parsing. */
function AnswerInput({ question: q, onSend, onLater }) {
  const later = onLater && <button type="button" className="eh-text-btn" onClick={onLater}>later — I'll come back to this</button>
  const [text, setText] = useState('')
  const ref = useRef(null)
  const dateRef = useRef(null)
  const openPicker = () => {
    const el = dateRef.current
    if (!el) return
    try { el.showPicker() } catch { el.click() }
  }
  useEffect(() => { ref.current?.focus() }, [])
  const canSkip = !q.required || q.default != null
  const submit = (e) => {
    e?.preventDefault()
    if (!text.trim() && !canSkip) return
    onSend(text)
  }

  if (q.kind === 'yesno') {
    return (
      <div className="eh-answer">
        <div className="eh-actions">
          <button ref={ref} type="button" className="eh-btn primary" onClick={() => onSend('yes')}>yes</button>
          <button type="button" className="eh-btn" onClick={() => onSend('no')}>no</button>
        </div>
        {q.help && <p className="eh-help">{q.help}</p>}
        {later && <p className="eh-kbd">{later}</p>}
      </div>
    )
  }

  return (
    <form className="eh-answer" onSubmit={submit}>
      {q.kind === 'choice' && (
        <div className="eh-chips">
          {q.options.map((o) => (
            <button key={o} type="button" className="eh-chipbtn" onClick={() => onSend(o)}>{o}</button>
          ))}
        </div>
      )}
      <div className="eh-row">
        <input
          ref={ref}
          className="eh-input"
          type={q.kind === 'number' ? 'text' : 'text'}
          inputMode={q.kind === 'number' ? 'decimal' : 'text'}
          value={text}
          placeholder={q.default != null ? showDefault(q) : q.person ? "a name — or 'me'" : q.kind === 'date' ? 'e.g. 3 March 2027' : q.kind === 'choice' ? 'or type an answer' : 'your answer'}
          aria-label={q.prompt}
          onChange={(e) => setText(e.target.value)}
        />
        {q.kind === 'date' && (
          <>
            <input ref={dateRef} className="eh-date-hidden" type="date" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.value && setText(spellIso(e.target.value))} />
            <button type="button" className="eh-btn" onClick={openPicker}>pick</button>
          </>
        )}
        <button type="submit" className="eh-btn primary" disabled={!text.trim() && !canSkip}>
          {!text.trim() && q.default != null ? 'use this' : !text.trim() && canSkip ? 'skip' : 'send'}
        </button>
      </div>
      {q.help && <p className="eh-help">{q.help}</p>}
      <p className="eh-kbd">
        {q.kind === 'date' && 'dates can be "3 March 2027", "03/03/2027" or "2027-03-03"'}
        {q.person && "type a name, or 'me' for yourself"}
        {q.default != null && text.trim() && <> · <button type="button" className="eh-text-btn" onClick={() => onSend('')}>use {showDefault(q)}</button></>}
        {!q.required && text.trim() && <> · <button type="button" className="eh-text-btn" onClick={() => onSend('')}>skip</button></>}
        {later && (q.kind === 'date' || q.person || (q.default != null && text.trim()) || (!q.required && text.trim())) && ' · '}
        {later}
      </p>
    </form>
  )
}

/** The map panel: the product moment. Each finished event lands here as a card. */
function MapPanel({ instances, deferred, lastAdded }) {
  const sorted = [...instances].sort((a, b) => a.anchorDate.localeCompare(b.anchorDate))
  const aside = (deferred || []).map(deferredLabel)
  return (
    <aside className="eh-map" aria-label="your map">
      <h3 className="eh-h">your map <span className="eh-count">{instances.length}</span></h3>
      {!instances.length && <p className="eh-muted">each finished event appears here</p>}
      <ul className="eh-cards">
        {sorted.map((i, k) => (
          <li key={`${i.title}|${i.anchorDate}|${k}`} className={`eh-card${i.title === lastAdded ? ' new' : ''}`}>
            <strong>{i.title}</strong>
            <span>{fmtIsoDate(i.anchorDate)}</span>
            <span className="eh-muted">{i.steps ? `${stepsText(i)} · first on ${fmtIsoDate(i.firstStep)}` : 'no tasks'}</span>
          </li>
        ))}
      </ul>
      {aside.length > 0 && (
        <>
          <h3 className="eh-h">to come back to <span className="eh-count">{aside.length}</span></h3>
          <ul className="eh-aside-list">
            {aside.map((t, k) => <li key={k}>{t}</li>)}
          </ul>
        </>
      )}
    </aside>
  )
}

/** "Put aside for later: MOT test · the Golf, Eye test" — shown at the end so nothing feels lost. */
function AsideNote({ deferred }) {
  const names = (deferred || []).map(deferredLabel)
  if (!names.length) return null
  return (
    <p className="eh-muted">
      Put aside: {names.join(', ')}. You'll find {names.length === 1 ? 'it' : 'them'} under "to come back to" on the <Link to="/tools/eventhorizon">event horizon</Link> page whenever you have the details.
    </p>
  )
}

function Review({ instances, deferred, busy, onCommit }) {
  const [dropped, setDropped] = useState(() => new Set())
  const kept = instances.filter((_, i) => !dropped.has(i))
  const toggle = (i) => {
    const n = new Set(dropped)
    if (n.has(i)) n.delete(i)
    else n.add(i)
    setDropped(n)
  }
  if (!instances.length) {
    return (
      <div className="eh-review">
        <p className="eh-bot">That's the end — nothing was added this time.</p>
        <AsideNote deferred={deferred} />
        <Link to="/tools/eventhorizon" className="eh-btn">back to event horizon</Link>
      </div>
    )
  }
  return (
    <div className="eh-review">
      <p className="eh-bot">That's everything. Here's what will go on your map — untick anything you'd rather leave out.</p>
      <AsideNote deferred={deferred} />
      <ul className="eh-review-list">
        {instances.map((i, k) => (
          <li key={k}>
            <label>
              <input type="checkbox" checked={!dropped.has(k)} onChange={() => toggle(k)} />
              <span><strong>{i.title}</strong> — {fmtIsoDate(i.anchorDate)} · {stepsText(i)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="eh-actions">
        <button type="button" className="eh-btn primary" disabled={busy || !kept.length} onClick={() => onCommit(kept)}>
          add {kept.length} to my map
        </button>
      </div>
    </div>
  )
}

function Results({ results, instances, deferred }) {
  const ok = results.filter((r) => !r.error)
  const anchorFor = (title) => instances.find((i) => i.title === title)?.anchorDate
  return (
    <div className="eh-review">
      <p className="eh-bot">{ok.length ? `${ok.length} added to your map.` : 'Nothing could be added.'}</p>
      <AsideNote deferred={deferred} />
      <ul className="eh-review-list">
        {results.map((r, k) => (
          <li key={k} className={r.error ? 'eh-err' : ''}>
            <strong>{r.title}</strong>
            {r.error ? ` — ${r.error}` : (
              <> — <Link to={`/tools/eventhorizon/calendar?date=${anchorFor(r.title) || ''}`}>see it on the map</Link></>
            )}
          </li>
        ))}
      </ul>
      <div className="eh-actions">
        <Link to="/tools/eventhorizon/calendar" className="eh-btn primary">my map</Link>
        <Link to="/tools/eventhorizon" className="eh-btn">back to event horizon</Link>
      </div>
    </div>
  )
}
