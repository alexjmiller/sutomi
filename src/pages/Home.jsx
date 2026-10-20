import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getLiveArticles, getWelcome } from '../articles'
import ArticleBody from '../components/ArticleBody'

export default function Home() {
  const { id } = useParams()
  const [articles, setArticles] = useState([])
  const [welcome, setWelcome] = useState(null)
  const [activeId, setActiveId] = useState(id || null)
  const [phase, setPhase] = useState(id ? 'open' : 'list')

  useEffect(() => {
    getLiveArticles().then(setArticles)
    getWelcome().then(setWelcome)
  }, [])

  useEffect(() => {
    if (id && phase === 'list') {
      setActiveId(id)
      setPhase('open')
    }
  }, [id])

  function openArticle(articleId) {
    setActiveId(articleId)
    window.history.pushState(null, '', `/article/${articleId}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })

    setPhase('step1')
    setTimeout(() => {
      setPhase('step2')
      setTimeout(() => setPhase('open'), 600)
    }, 400)
  }

  function closeArticle() {
    window.history.pushState(null, '', '/')

    setPhase('back2')
    setTimeout(() => setPhase('back2b'), 100)
    setTimeout(() => {
      setPhase('back1')
      setTimeout(() => {
        setPhase('list')
        setActiveId(null)
      }, 350)
    }, 400)
  }

  useEffect(() => {
    function onPopState() {
      const match = window.location.pathname.match(/^\/article\/(.+)$/)
      if (match) openArticle(match[1])
      else closeArticle()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function handleClick(e, articleId, isActive) {
    if (e.target.closest('a')) return // a link inside the article: the browser follows it, the article stays open
    e.preventDefault()
    if (phase === 'list') openArticle(articleId)
    else if (phase === 'open' && isActive) closeArticle()
  }

  const expanded = ['step1','step2','open'].includes(phase)
  const othersBack = ['back2b','back1'].includes(phase)

  function bodyMode(isActive) {
    if (!isActive) return 'condensed'
    if (['step1','step2','open'].includes(phase)) return phase === 'step1' ? 'expanding' : 'open'
    if (['back2','back2b','back1'].includes(phase)) return 'condensing'
    return 'condensed'
  }

  return (
    <main className="page">
      <div className={`welcome-area ${expanded && !othersBack ? 'gone' : ''} ${othersBack ? 'returning' : ''}`}>
        {welcome && (
          <div className="intro" dangerouslySetInnerHTML={{ __html: welcome.body }} />
        )}
      </div>

      {expanded && (
        <div className={`back-area ${phase === 'step1' ? 'entering' : ''}`}>
          <a href="/" onClick={(e) => { e.preventDefault(); closeArticle() }} className="back-link">&lt; back</a>
        </div>
      )}

      <ul className="article-list">
        {articles.map((a) => {
          const isActive = a.id === activeId
          const isOther = activeId && !isActive

          return (
            <li
              key={a.id}
              className={[
                'article-item-wrap',
                isOther && expanded && !othersBack ? 'away' : '',
                isOther && othersBack ? 'returning' : '',
                isActive && expanded ? 'active-open' : '',
              ].join(' ')}
            >
              <div
                className={[
                  'article-link-block',
                  isActive && expanded ? 'grown' : '',
                ].join(' ')}
                onClick={(e) => handleClick(e, a.id, isActive)}
                style={{ cursor: 'pointer' }}
              >
                <span className="article-title">{a.title}</span>

                {isActive && expanded && (
                  <span className={`article-date squeezed show`}>{a.date}</span>
                )}

                <ArticleBody preview={a.preview} html={a.body} mode={bodyMode(isActive)} />
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
