// Tasklists — the llli.st list (~/Projects/listicles) as a sutomi tool, several lists, stored server-side.
// Add an item, flag its priority, tick it off, park it, delete it. Ticked items fade out after a day.
// On a touch screen a row is swiped right to delete and left to park (swipe.js; on the index a swipe
// right asks before deleting a list); with a mouse the park / delete buttons appear on hover. Item text is edited in place, as in llli.st: saved on blur or
// Enter (which also returns to the add box), Escape reverts, emptied or unchanged text is ignored.
// Each action is one op: applied locally at once, sent to the server, which merges it into the stored
// list and answers with the result — so two devices on the same list don't overwrite each other.
import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { listLists, getList, createList, deleteList, patchList } from './api'
import { split, summary, priorityOf, applyOp, opAdd, opToggle, opCycle, opText, opPark, opRemove } from './lists'
import { useSwipe } from './swipe'
import './tasklists.css'

export default function Tasklists() {
  const { id } = useParams()
  return id ? <ListPage id={id} /> : <ListIndex />
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function ListIndex() {
  const [lists, setLists] = useState(null)
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    listLists().then(setLists).catch(() => setError("couldn't load your lists"))
  }, [])

  async function create(e) {
    e.preventDefault()
    const text = name.trim()
    if (!text) return
    try {
      const list = await createList({ name: text, items: [] })
      navigate(`/tools/tasklists/${list.id}`)
    } catch {
      setError("couldn't create the list")
    }
  }

  async function destroy(list) {
    try {
      await deleteList(list.id)
      setLists(lists.filter((l) => l.id !== list.id))
    } catch {
      setError("couldn't delete the list")
    } finally {
      setConfirm(null)
    }
  }

  return (
    <main className="page tl">
      <Link to="/dashboard" className="back-link">&lt; dashboard</Link>
      <h1 className="article-heading">tasklists</h1>
      <p className="tl-intro">simple lists: add things, flag the urgent ones, tick them off, park what can wait</p>

      <form className="tl-add" onSubmit={create}>
        <input className="tl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="a new list..." autoComplete="off" />
        <button type="submit" className="tl-text-btn">create</button>
      </form>

      {error && <p className="login-error">{error}</p>}
      {lists && lists.length === 0 && <p className="tl-muted">no lists yet</p>}
      {lists && lists.length > 0 && (
        <ul className="tl-lists">
          {lists.map((l) => (
            <ListRow key={l.id} list={l} confirming={confirm === l.id} onAsk={() => setConfirm(l.id)} onCancel={() => setConfirm(null)} onDelete={() => destroy(l)} />
          ))}
        </ul>
      )}
      <p className="tl-muted tl-swipe-hint">swipe a list right to delete it</p>
    </main>
  )
}

// One list on the index. On a touch screen a swipe right brings up the delete prompt (a whole list
// is worth a second look, so the swipe asks rather than deletes); with a mouse there's a delete button.
function ListRow({ list, confirming, onAsk, onCancel, onDelete }) {
  const s = summary(list.items || [])
  const swipe = useSwipe({ onRight: onAsk })
  return (
    <li className={`tl-lists-item tl-swipe${swipe.className}`} {...swipe.handlers}>
      <span className="tl-under delete" aria-hidden="true">delete</span>
      <div className="tl-row tl-lists-row" style={swipe.style}>
        <Link to={`/tools/tasklists/${list.id}`} className="tl-lists-name">{list.name || 'untitled'}</Link>
        <span className="tl-muted">
          {s.open === 0 ? 'nothing open' : `${s.open} open`}{s.parked ? ` · ${s.parked} parked` : ''} · {fmtDate(list.updatedAt)}
        </span>
        {confirming ? (
          <span className="tl-confirm">
            delete this list?
            <button type="button" className="tl-text-btn danger" onClick={onDelete}>yes</button>
            <button type="button" className="tl-text-btn" onClick={onCancel}>no</button>
          </span>
        ) : (
          <button type="button" className="tl-text-btn quiet tl-delete-btn" onClick={onAsk}>delete</button>
        )}
      </div>
    </li>
  )
}

function ListPage({ id }) {
  const [list, setList] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const [renaming, setRenaming] = useState(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    getList(id).then(setList).catch(() => setError("couldn't load this list"))
  }, [id])

  // When the tab comes back: fetch what other devices may have changed, and let aged-out items go.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      getList(id).then(setList).catch(() => { /* keep what we have */ })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [id])

  /** Show the change at once, send it, then adopt the server's merged list. */
  function send(body) {
    setError('')
    if (body.ops) setList((l) => ({ ...l, items: body.ops.reduce(applyOp, l.items || []) }))
    if (body.name) setList((l) => ({ ...l, name: body.name }))
    patchList(id, body).then(setList).catch(() => setError("couldn't save — check your connection"))
  }
  const change = (op) => send({ ops: [op] })
  const focusAdd = () => inputRef.current?.focus()

  function add(e) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    change(opAdd(t))
    setText('')
    inputRef.current?.focus()
  }

  function saveName() {
    const value = renaming.trim()
    setRenaming(null)
    if (value && value !== list.name) send({ name: value })
  }

  async function destroy() {
    try {
      await deleteList(id)
      navigate('/tools/tasklists')
    } catch {
      setError("couldn't delete the list")
    }
  }

  if (error && !list) return <main className="page tl"><Link to="/tools/tasklists" className="back-link">&lt; tasklists</Link><p className="login-error">{error}</p></main>
  if (!list) return <main className="page tl"><Link to="/tools/tasklists" className="back-link">&lt; tasklists</Link><p className="tl-muted">loading…</p></main>

  const { open, parked } = split(list.items || [], now)

  return (
    <main className="page tl">
      <Link to="/tools/tasklists" className="back-link">&lt; tasklists</Link>
      {renaming !== null ? (
        <input
          className="tl-input tl-rename"
          value={renaming}
          onChange={(e) => setRenaming(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenaming(null) }}
          autoFocus
        />
      ) : (
        <h1 className="article-heading tl-title" title="click to rename" onClick={() => setRenaming(list.name || '')}>{list.name || 'untitled'}</h1>
      )}

      <form className="tl-add" onSubmit={add}>
        <input ref={inputRef} className="tl-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="add a new item..." autoComplete="off" autoFocus />
        <button type="submit" className="tl-text-btn">add</button>
      </form>
      {error && <p className="login-error">{error}</p>}

      {open.length === 0 && parked.length === 0 && <p className="tl-muted">nothing here yet</p>}
      <ul className="tl-items">
        {open.map((it) => <Row key={it.id} item={it} onChange={change} focusAdd={focusAdd} />)}
      </ul>

      {parked.length > 0 && (
        <section className="tl-parked">
          <h2 className="tl-parked-heading">parked</h2>
          <ul className="tl-items">
            {parked.map((it) => <Row key={it.id} item={it} onChange={change} focusAdd={focusAdd} />)}
          </ul>
        </section>
      )}

      <p className="tl-muted tl-foot">ticked items disappear a day after being ticked · <span className="tl-swipe-hint">swipe right to delete, left to park · </span><button type="button" className="tl-text-btn quiet" onClick={() => { if (window.confirm(`delete the list "${list.name}"?`)) destroy() }}>delete this list</button></p>
    </main>
  )
}

function Row({ item, onChange, focusAdd }) {
  const priority = priorityOf(item)
  const [draft, setDraft] = useState(item.text)
  const revert = useRef(false)
  useEffect(() => { setDraft(item.text) }, [item.text])
  function saveText() {
    const t = draft.trim()
    if (revert.current || !t || t === item.text) { revert.current = false; setDraft(item.text); return }
    onChange(opText(item, t))
  }
  function textKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); focusAdd?.() }
    else if (e.key === 'Escape') { revert.current = true; e.currentTarget.blur() }
  }
  const keyAct = (fn) => (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fn() } }
  const cycle = () => onChange(opCycle(item))
  const tick = () => onChange(opToggle(item))
  const swipe = useSwipe({ onRight: () => onChange(opRemove(item)), onLeft: () => onChange(opPark(item, !item.parked)) })
  return (
    <li className={`tl-item tl-swipe${item.done ? ' done' : ''}${swipe.className}`} {...swipe.handlers}>
      <span className="tl-under delete" aria-hidden="true">delete</span>
      <span className="tl-under park" aria-hidden="true">{item.parked ? 'unpark' : 'park'}</span>
      <div className="tl-row" style={swipe.style}>
        {item.done ? (
          <span className="tl-flag inert" />
        ) : (
          <span
            className={`tl-flag ${priority}`}
            role="button"
            tabIndex={0}
            title={`priority: ${priority} — click to change`}
            aria-label={`priority: ${priority}. click to change`}
            onClick={cycle}
            onKeyDown={keyAct(cycle)}
          >
            <Flag priority={priority} />
          </span>
        )}
        <span
          className="tl-check"
          role="checkbox"
          tabIndex={0}
          aria-checked={item.done}
          title={item.done ? 'mark as not done' : 'mark as done'}
          onClick={tick}
          onKeyDown={keyAct(tick)}
        >
          {item.done ? '✓' : ''}
        </span>
        <input
          className="tl-text"
          value={draft}
          aria-label="item text"
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveText}
          onKeyDown={textKey}
        />
        <span className="tl-actions">
          <button type="button" className="tl-action park" onClick={() => onChange(opPark(item, !item.parked))}>{item.parked ? 'unpark' : 'park'}</button>
          <button type="button" className="tl-action delete" onClick={() => onChange(opRemove(item))}>delete</button>
        </span>
      </div>
    </li>
  )
}

// The llli.st flag, in sutomi's colours: high red, medium sun yellow, low a dotted outline shown on hover.
const FLAG_PATH = 'M1,2.30818948 C0.796229554,0.769396494 2.35861805,0 5.6871655,0 C7.99121808,0 11.4147245,1.57087041 15.4204747,2.30818948 C16.6079101,2.52675498 18.4677519,2.36008831 21,1.80818948 L19.7524064,16.3081895 C17.3511077,16.5077968 15.5055243,16.5077968 14.2156561,16.3081895 C10.4681414,15.7282609 7.85845124,14.3081895 5.6871655,14.3081895 C2.3948679,14.3081895 0.832479399,14.9748561 1,16.3081895 L1,2.30818948 Z'
const FLAG_COLOURS = { high: '#d4532b', medium: '#F9CF42' }

function Flag({ priority }) {
  if (priority === 'low') {
    return (
      <svg viewBox="0 0 21 26" aria-hidden="true" className="tl-flag-low">
        <line x1="1.5" y1="3" x2="1.5" y2="25.8" stroke="#46413d" strokeDasharray="1,1" />
        <path d={FLAG_PATH} fill="none" stroke="#46413d" strokeDasharray="1" transform="translate(0.5 1)" />
      </svg>
    )
  }
  const c = FLAG_COLOURS[priority]
  return (
    <svg viewBox="0 0 21 28" aria-hidden="true">
      <line x1="1.5" y1="1.8" x2="1.5" y2="26.8" stroke={c} strokeLinecap="round" strokeWidth="1.5" />
      <path d={FLAG_PATH} fill={c} />
    </svg>
  )
}
