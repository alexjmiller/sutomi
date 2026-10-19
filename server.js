import express from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { thinkingRouter } from './server/thinking.js'
import { eventHorizonRouter } from './server/eventhorizon.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const DATA_FILE = join(__dirname, 'data', 'articles.json')
const PASSWORD = process.env.SUTOMI_PASSWORD || 'sutomi'

app.use(express.json({ limit: '2mb' })) // interview state round-trips whole compiled plans
app.use(express.static(join(__dirname, 'dist')))

function readArticles() {
  if (!existsSync(DATA_FILE)) return []
  return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
}

function ensureDataDir() {
  const dir = dirname(DATA_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function writeArticles(articles) {
  ensureDataDir()
  writeFileSync(DATA_FILE, JSON.stringify(articles, null, 2))
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30).replace(/-$/, '')
}

function uniqueSlug(title, articles) {
  let slug = slugify(title)
  if (!articles.some((a) => a.id === slug)) return slug
  let i = 2
  while (articles.some((a) => a.id === `${slug}-${i}`)) i++
  return `${slug}-${i}`
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()
}

function makePreview(body, maxLen = 200) {
  const plain = stripHtml(body || '')
  if (plain.length <= maxLen) return plain
  const cut = plain.lastIndexOf(' ', maxLen)
  return plain.slice(0, cut > 0 ? cut : maxLen) + '...'
}

function withPreview(article) {
  return { ...article, preview: makePreview(article.body) }
}

function auth(req, res, next) {
  const token = req.headers.authorization
  if (token !== `Bearer ${PASSWORD}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

// Public: get welcome message
app.get('/api/welcome', (_req, res) => {
  const welcome = readArticles().find((a) => a.type === 'welcome')
  res.json(welcome || null)
})

// Newest first: by date (dd/mm/yyyy), same-day articles in reverse creation order. The file keeps creation order.
const dateKey = (d) => (typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? d.slice(6) + d.slice(3, 5) + d.slice(0, 2) : '')
const newestFirst = (articles) => articles
  .map((a, i) => [a, i])
  .sort(([a, i], [b, j]) => dateKey(b.date).localeCompare(dateKey(a.date)) || j - i)
  .map(([a]) => a)

// Public: get live articles (excluding welcome)
app.get('/api/articles', (_req, res) => {
  const articles = readArticles().filter((a) => a.live && a.type !== 'welcome')
  res.json(newestFirst(articles).map(withPreview))
})

// Auth: get all articles (including drafts)
app.get('/api/articles/all', auth, (_req, res) => {
  res.json(newestFirst(readArticles()))
})

// Auth: create article
app.post('/api/articles', auth, (req, res) => {
  const { title, body } = req.body
  if (!title) return res.status(400).json({ error: 'title required' })
  const articles = readArticles()
  const article = {
    id: uniqueSlug(title, articles),
    title,
    body: body || '',
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    live: true,
  }
  articles.push(article)
  writeArticles(articles)
  res.json(article)
})

// Auth: update article
app.put('/api/articles/:id', auth, (req, res) => {
  const articles = readArticles()
  const idx = articles.findIndex((a) => a.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  const { title, body, live } = req.body
  if (title !== undefined && title !== articles[idx].title && articles[idx].type !== 'welcome') {
    articles[idx].title = title
    articles[idx].id = uniqueSlug(title, articles.filter((_, i) => i !== idx))
  } else if (title !== undefined) {
    articles[idx].title = title
  }
  if (body !== undefined) articles[idx].body = body
  if (live !== undefined) articles[idx].live = live
  writeArticles(articles)
  res.json(articles[idx])
})

// Auth: delete article
app.delete('/api/articles/:id', auth, (req, res) => {
  let articles = readArticles()
  articles = articles.filter((a) => a.id !== req.params.id)
  writeArticles(articles)
  res.json({ ok: true })
})

// Auth: login check
app.post('/api/login', (req, res) => {
  const { password } = req.body
  if (password === PASSWORD) {
    res.json({ name: 'Alex', token: PASSWORD })
  } else {
    res.status(401).json({ error: 'wrong password' })
  }
})

// Tools (auth): Thinking Machine briefs
app.use('/api/thinking', auth, thinkingRouter(join(__dirname, 'data', 'thinking.json')))
app.use('/api/eh', auth, eventHorizonRouter())

// SPA fallback
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`sutomi running on port ${PORT}`)
})
