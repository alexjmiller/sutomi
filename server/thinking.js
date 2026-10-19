// Thinking Machine — server-side persistence for briefs (no AI).
// Mounted at /api/thinking behind auth. The server stores whole brief objects and
// manages id/createdAt/updatedAt; the shape (and v1 -> v2 migration) lives in the client.
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { randomBytes } from 'crypto'

export function thinkingRouter(dataFile) {
  const router = Router()

  function readAll() {
    if (!existsSync(dataFile)) return []
    return JSON.parse(readFileSync(dataFile, 'utf-8'))
  }

  function writeAll(briefs) {
    const dir = dirname(dataFile)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(dataFile, JSON.stringify(briefs, null, 2))
  }

  router.get('/', (_req, res) => {
    res.json(readAll().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))
  })

  router.post('/', (req, res) => {
    const briefs = readAll()
    const now = new Date().toISOString()
    const brief = { ...req.body, id: randomBytes(5).toString('hex'), createdAt: now, updatedAt: now }
    briefs.push(brief)
    writeAll(briefs)
    res.json(brief)
  })

  router.get('/:id', (req, res) => {
    const brief = readAll().find((b) => b.id === req.params.id)
    if (!brief) return res.status(404).json({ error: 'not found' })
    res.json(brief)
  })

  // Replace the brief's content; id and createdAt are kept
  router.put('/:id', (req, res) => {
    const briefs = readAll()
    const idx = briefs.findIndex((b) => b.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'not found' })
    const { id, createdAt } = briefs[idx]
    briefs[idx] = { ...req.body, id, createdAt, updatedAt: new Date().toISOString() }
    writeAll(briefs)
    res.json(briefs[idx])
  })

  router.delete('/:id', (req, res) => {
    writeAll(readAll().filter((b) => b.id !== req.params.id))
    res.json({ ok: true })
  })

  return router
}
