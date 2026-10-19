// Thinking Machine — route component: list of briefs, or one brief as a conversation.
import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { listBriefs, createBrief, deleteBrief } from './api'
import { emptyBrief, briefTitle, inProgress, openQuestions } from './flow'
import Session from './Session'
import './thinking.css'

export default function ThinkingMachine() {
  const { id } = useParams()
  return id ? <Session key={id} id={id} /> : <BriefList />
}

const titleOf = (b) => (b.version === 2 ? briefTitle(b) : (b.answers?.idea || 'untitled thinking'))

function BriefList() {
  const [briefs, setBriefs] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function refresh() {
    listBriefs().then(setBriefs).catch(() => setError("couldn't load your briefs"))
  }
  useEffect(() => { refresh() }, [])

  async function start() {
    try {
      const b = await createBrief(emptyBrief())
      navigate(`/tools/thinking/${b.id}`)
    } catch {
      setError("couldn't start a new brief")
    }
  }

  async function remove(b) {
    if (!window.confirm(`Delete "${titleOf(b)}"? This can't be undone.`)) return
    await deleteBrief(b.id)
    refresh()
  }

  return (
    <main className="page tm">
      <Link to="/dashboard" className="back-link">&lt; back</Link>
      <h1 className="article-heading">Thinking machine</h1>
      <p className="tm-intro">a few questions, one at a time, to turn a rough aim into the smaller questions behind it, work on one, and carry what you learn back to the aim</p>

      <button type="button" className="new-article-btn" onClick={start}>what do you want to work on?</button>
      {error && <p className="login-error">{error}</p>}

      {briefs && briefs.length > 0 && (
        <>
          <h2 className="tm-list-heading">saved briefs</h2>
          <ul className="manage-list">
            {briefs.map((b) => {
              const active = b.version === 2 ? inProgress(b) : []
              const open = b.version === 2 ? openQuestions(b).length : 0
              return (
                <li key={b.id} className="manage-item tm-list-sub">
                  <Link to={`/tools/thinking/${b.id}`} className="manage-article-name">{titleOf(b)}</Link>
                  <span className="tm-muted">{new Date(b.updatedAt).toLocaleDateString('en-GB')}</span>
                  {active.length > 0 && <span className="tm-waiting">in progress: {active.map((q) => (q.isAim ? 'the aim' : q.text)).join(', ')}</span>}
                  {open > 0 && <span className="tm-muted">{open} to explore</span>}
                  <button type="button" className="manage-status draft" onClick={() => remove(b)}>delete</button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
