import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getLiveArticles } from '../articles'

function stripHtml(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || ''
}

function truncate(text, maxLen = 200) {
  const plain = stripHtml(text)
  if (plain.length <= maxLen) return plain
  const cut = plain.lastIndexOf(' ', maxLen)
  return plain.slice(0, cut > 0 ? cut : maxLen) + '...'
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
