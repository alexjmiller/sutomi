// Thinking Machine — route component: list of briefs, or one brief as a conversation.
import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { listBriefs, createBrief, deleteBrief } from './api'
import { emptyAnswers, sessionTitle } from './flow'
import Session from './Session'
import './thinking.css'

export default function ThinkingMachine() {
  const { id } = useParams()
  return id ? <Session key={id} id={id} /> : <BriefList />
}

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
      const b = await createBrief({ answers: emptyAnswers(), step: 'start' })
      navigate(`/tools/thinking/${b.id}`)
    } catch {
      setError("couldn't start a new brief")
    }
  }

  async function remove(b) {
    const title = sessionTitle(b.answers)
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return
    await deleteBrief(b.id)
    refresh()
  }

  return (
    <main className="page tm">
      <Link to="/dashboard" className="back-link">&lt; back</Link>
      <h1 className="article-heading">Thinking machine</h1>
      <p className="tm-intro">a few questions, one at a time, to turn a rough idea or problem into an outcome, some ideas, and a small test</p>

      <button type="button" className="new-article-btn" onClick={start}>what do you want to work on?</button>
      {error && <p className="login-error">{error}</p>}

      {briefs && briefs.length > 0 && (
        <>
          <h2 className="tm-list-heading">saved briefs</h2>
          <ul className="manage-list">
            {briefs.map((b) => (
              <li key={b.id} className="manage-item">
                <Link to={`/tools/thinking/${b.id}`} className="manage-article-name">{sessionTitle(b.answers)}</Link>
                <span className="tm-muted">{new Date(b.updatedAt).toLocaleDateString('en-GB')}</span>
                <button type="button" className="manage-status draft" onClick={() => remove(b)}>delete</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
