// Social previews. Crawlers (iMessage, Slack, WhatsApp, X, Facebook…) read the HTML and never run
// the app, so the server fills in the title, description and image tags for the page being shared.
// The card is deliberately compact (`twitter:card: summary`, a square image): the sutomi logo and
// wordmark as a thumbnail, then the title of what is being shared and a line of its text.
import { readFileSync } from 'fs'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c])

/** Plain text from article HTML, cut at a word boundary with an ellipsis. */
export function summarise(html, max = 160) {
  const text = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/\s+\S{1,2}$/, '').replace(/[,;:.\s]+$/, '') + '…' // no dangling 'I…'
}

/** dd/mm/yyyy → ISO date, or undefined. */
const isoDate = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined
}

/**
 * Express handler serving dist/index.html with share tags for the requested path:
 * `/article/:slug` → that live article; anything else → the site (welcome text as the description).
 */
export function shareHandler({ indexFile, origin, readArticles, siteName = 'sutomi', image = '/share.png', fallback = 'the personal site of Alexander Miller' }) {
  let cached = null
  const read = () => {
    if (process.env.NODE_ENV === 'production') return (cached ??= readFileSync(indexFile, 'utf-8'))
    return readFileSync(indexFile, 'utf-8') // dev: pick up a fresh build without restarting
  }

  return (req, res) => {
    const articles = readArticles()
    const welcome = articles.find((a) => a.type === 'welcome')
    const match = /^\/article\/([^/]+)$/.exec(req.path)
    const article = match && articles.find((a) => a.id === decodeURIComponent(match[1]) && a.live !== false && a.type !== 'welcome')

    const title = article ? article.title : siteName
    const description = summarise(article ? article.body : welcome?.body) || fallback
    const url = origin + (article ? `/article/${encodeURIComponent(article.id)}` : '/')
    const tags = [
      ['name', 'description', description],
      ['property', 'og:site_name', siteName],
      ['property', 'og:type', article ? 'article' : 'website'],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:url', url],
      ['property', 'og:image', origin + image],
      ['property', 'og:image:width', '1200'],
      ['property', 'og:image:height', '1200'],
      ['property', 'og:image:alt', siteName],
      article && ['property', 'article:published_time', isoDate(article.date)],
      ['name', 'twitter:card', 'summary'],
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', description],
      ['name', 'twitter:image', origin + image],
    ]
      .filter((t) => t && t[2])
      .map(([attr, name, value]) => `    <meta ${attr}="${name}" content="${esc(value)}" />`)
      .join('\n')

    let html = read().replace(/\s*<\/head>/, `\n${tags}\n  </head>`)
    if (article) html = html.replace('<title>sutomi</title>', `<title>${esc(title)} · ${siteName}</title>`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  }
}
