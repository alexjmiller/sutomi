import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getLiveArticles } from '../articles'

function truncate(text, maxLen = 200) {
  if (!text || text.length <= maxLen) return text
  const cut = text.lastIndexOf(' ', maxLen)
  return text.slice(0, cut > 0 ? cut : maxLen) + '...'
}

export default function Home() {
  const [articles, setArticles] = useState([])

  useEffect(() => {
    getLiveArticles().then(setArticles)
  }, [])

  return (
    <main className="page">
      <div className="intro">
        <p>Hi there,</p>
        <p>This is my collection of musings about life on our little planet and subjects that interest me.</p>
      </div>
      <ul className="article-list">
        {articles.map((a) => (
          <li key={a.id} className="article-item">
            <Link to={`/article/${a.id}`} className="article-link">
              <span className="article-title">{a.title}</span>
              <span className="article-summary">{truncate(a.body)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
