// A JSON-file collection behind auth: whole objects in, whole objects out. The server owns
// id / createdAt / updatedAt; the client owns the shape. Used by the Thinking Machine (briefs)
// and the tasklists tool (lists).
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { randomBytes } from 'crypto'

export function collectionRouter(dataFile) {
  const router = Router()

  function readAll() {
    if (!existsSync(dataFile)) return []
    return JSON.parse(readFileSync(dataFile, 'utf-8'))
  }

  function writeAll(items) {
    const dir = dirname(dataFile)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(dataFile, JSON.stringify(items, null, 2))
  }

  router.get('/', (_req, res) => {
    res.json(readAll().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))
  })

  router.post('/', (req, res) => {
    const items = readAll()
    const now = new Date().toISOString()
    const item = { ...req.body, id: randomBytes(5).toString('hex'), createdAt: now, updatedAt: now }
    items.push(item)
    writeAll(items)
    res.json(item)
  })

  router.get('/:id', (req, res) => {
    const item = readAll().find((b) => b.id === req.params.id)
    if (!item) return res.status(404).json({ error: 'not found' })
    res.json(item)
  })

  // Replace the content; id and createdAt are kept
  router.put('/:id', (req, res) => {
    const items = readAll()
    const idx = items.findIndex((b) => b.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'not found' })
    const { id, createdAt } = items[idx]
    items[idx] = { ...req.body, id, createdAt, updatedAt: new Date().toISOString() }
    writeAll(items)
    res.json(items[idx])
  })

  router.delete('/:id', (req, res) => {
    writeAll(readAll().filter((b) => b.id !== req.params.id))
    res.json({ ok: true })
  })

  return router
}
