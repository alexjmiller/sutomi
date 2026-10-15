import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAllArticles, createArticle, updateArticle, deleteArticle } from '../articles'
import RichEditor from '../components/RichEditor'

export default function ManageArticles() {
  const [articles, setArticles] = useState([])
  const [welcome, setWelcome] = useState(null)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isWelcome, setIsWelcome] = useState(false)

  function refresh() {
    getAllArticles().then((all) => {
      setWelcome(all.find((a) => a.type === 'welcome') || null)
      setArticles(all.filter((a) => a.type !== 'welcome'))
    })
  }

  useEffect(() => { refresh() }, [])

  function handleNew() {
    setEditing('new')
    setTitle('')
    setBody('')
    setIsWelcome(false)
  }

  function handleEdit(article) {
    setEditing(article.id)
    setTitle(article.title)
    setBody(article.body)
    setIsWelcome(article.type === 'welcome')
  }

  async function handlePublish() {
    if (!isWelcome && !title.trim()) return
    if (editing === 'new') {
      await createArticle(title, body)
    } else {
      const updated = await updateArticle(editing, { title, body })
      if (updated.id !== editing) {
        setEditing(updated.id)
      }
    }
    setEditing(null)
    refresh()
  }

  async function handleDelete() {
    if (editing === 'new') {
      setEditing(null)
      return
    }
    if (isWelcome) {
      setEditing(null)
      return
    }
    await deleteArticle(editing)
    setEditing(null)
    refresh()
  }

  async function handleToggleLive(article) {
    await updateArticle(article.id, { live: !article.live })
    refresh()
  }

  return (
    <main className="page">
      <Link to="/dashboard" className="back-link">&lt; back</Link>
      <h1 className="article-heading">Articles</h1>

      <div className="manage-layout">
        <div className="manage-sidebar">
          {welcome && (
            <div className="manage-section">
              <button className="manage-article-name" onClick={() => handleEdit(welcome)}>
                Welcome message
              </button>
            </div>
          )}
          <ul className="manage-list">
            {articles.map((a) => (
              <li key={a.id} className="manage-item">
                <button className="manage-article-name" onClick={() => handleEdit(a)}>
                  {a.title}
                </button>
                <button
                  className={`manage-status ${a.live ? 'live' : 'draft'}`}
                  onClick={() => handleToggleLive(a)}
                >
                  {a.live ? 'live' : 'draft'}
                </button>
              </li>
            ))}
          </ul>
          <button className="new-article-btn" onClick={handleNew}>new article</button>
        </div>

        {editing && (
          <div className="editor">
            {!isWelcome && (
              <input
                className="editor-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Article title"
              />
            )}
            <RichEditor
              value={body}
              onChange={setBody}
              placeholder={isWelcome ? 'Welcome message' : 'Article body'}
            />
            <div className="editor-actions">
              <button className="editor-btn publish" onClick={handlePublish}>Publish</button>
              {!isWelcome && (
                <button className="editor-btn delete" onClick={handleDelete}>Delete</button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
