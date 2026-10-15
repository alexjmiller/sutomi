import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getArticle } from '../articles'

export default function Article() {
  const { id } = useParams()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getArticle(id).then((a) => {
      setArticle(a)
      setLoading(false)
    })
  }, [id])

  if (loading) return <main className="page" />

  if (!article) {
    return (
      <main className="page">
        <Link to="/" className="back-link">&lt; back</Link>
        <p>Article not found.</p>
      </main>
    )
  }

  return (
    <main className="page">
      <Link to="/" className="back-link">&lt; back</Link>
      <div className="article-header-row">
        <h1 className="article-heading">{article.title}</h1>
        <span className="article-date">{article.date}</span>
      </div>
      <div className="article-body" dangerouslySetInnerHTML={{ __html: article.body }} />
    </main>
  )
}
