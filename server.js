import express from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const DATA_FILE = join(__dirname, 'data', 'articles.json')
const PASSWORD = process.env.SUTOMI_PASSWORD || 'sutomi'

app.use(express.json())
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

function auth(req, res, next) {
  const token = req.headers.authorization
  if (token !== `Bearer ${PASSWORD}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

// Public: get live articles
app.get('/api/articles', (_req, res) => {
  const articles = readArticles().filter((a) => a.live)
  res.json(articles)
})

// Auth: get all articles (including drafts)
app.get('/api/articles/all', auth, (_req, res) => {
  res.json(readArticles())
})

// Auth: create article
app.post('/api/articles', auth, (req, res) => {
  const { title, body } = req.body
  if (!title) return res.status(400).json({ error: 'title required' })
  const articles = readArticles()
  const article = {
    id: Date.now().toString(36),
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
  if (title !== undefined) articles[idx].title = title
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

// SPA fallback
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`sutomi running on port ${PORT}`)
})
