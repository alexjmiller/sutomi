import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getLiveArticles, getWelcome } from '../articles'

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

// Phases forward:  list -> step1 -> step2 -> step3 -> open
// Phases back:     open -> back3 -> back2 -> back1 -> list
//
// step1: welcome collapses, others collapse, title grows, snippet stays — all together
// step2: date squeezes in
// step3: remaining body unrolls like a sheet
//
// back3: body rolls back up
// back2: date squeezes out
// back1: title shrinks, others expand, welcome expands

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
      setTimeout(() => {
        setPhase('step3')
        setTimeout(() => setPhase('open'), 500)
      }, 250)
    }, 400)
  }

  function closeArticle() {
    window.history.pushState(null, '', '/')

    setPhase('back3')
    setTimeout(() => {
      setPhase('back1')
      setTimeout(() => {
        setPhase('list')
        setActiveId(null)
      }, 400)
    }, 400)
  }

  useEffect(() => {
    function onPopState() {
      const match = window.location.pathname.match(/^\/article\/(.+)$/)
      if (match) {
        openArticle(match[1])
      } else {
        closeArticle()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function handleClick(e, articleId, isActive) {
    e.preventDefault()
    if (phase === 'list') {
      openArticle(articleId)
    } else if (phase === 'open' && isActive) {
      closeArticle()
    }
  }

  const expanded = ['step1','step2','step3','open'].includes(phase)
  const dateIn = ['step2','step3','open'].includes(phase)
  const bodyIn = ['step3','open'].includes(phase)
  const closing = ['back3','back1'].includes(phase)
  const titleOut = phase === 'back1'

  return (
    <main className="page">
      {/* Welcome message — collapses in step1 */}
      <div className={`welcome-area ${expanded ? 'gone' : ''} ${titleOut ? 'returning' : ''}`}>
        {welcome && (
          <div className="intro" dangerouslySetInnerHTML={{ __html: welcome.body }} />
        )}
      </div>

      {/* Back link — appears after welcome gone */}
      {expanded && (
        <div className={`back-area ${phase === 'step1' ? 'entering' : ''}`}>
          <a href="/" onClick={(e) => { e.preventDefault(); closeArticle() }} className="back-link">&lt; back</a>
        </div>
      )}

      {/* Articles */}
      <ul className="article-list">
        {articles.map((a) => {
          const isActive = a.id === activeId
          const isOther = activeId && !isActive

          return (
            <li
              key={a.id}
              className={[
                'article-item-wrap',
                isOther && expanded ? 'away' : '',
                isOther && titleOut ? 'returning' : '',
                isActive && expanded ? 'active-open' : '',
              ].join(' ')}
            >
              <a
                href={isActive ? '/' : `/article/${a.id}`}
                onClick={(e) => handleClick(e, a.id, isActive)}
                className={[
                  'article-link-block',
                  isActive && expanded ? 'grown' : '',
                ].join(' ')}
              >
                <span className="article-title">{a.title}</span>

                {isActive && dateIn && (
                  <span className={`article-date squeezed ${dateIn ? 'show' : ''}`}>{a.date}</span>
                )}

                <span className="article-summary">{truncate(a.body)}</span>
              </a>

              {isActive && (
                <div
                  className={`article-unroll ${bodyIn && !closing ? 'reveal' : ''} ${phase === 'back3' ? 'hiding' : ''}`}
                  onClick={() => phase === 'open' && closeArticle()}
                  style={{ cursor: phase === 'open' ? 'pointer' : 'default' }}
                >
                  <div className="article-body" dangerouslySetInnerHTML={{ __html: a.body }} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
