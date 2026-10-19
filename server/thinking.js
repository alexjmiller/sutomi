// Thinking Machine — server-side persistence for saved briefs (no AI).
// Mounted at /api/thinking behind auth. Each brief: { id, createdAt, updatedAt, answers, step, skipped, hmwStale }.
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

  // List: newest first, answers trimmed to what the list needs
  router.get('/', (_req, res) => {
    const briefs = readAll()
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map((b) => ({
        id: b.id,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        answers: { idea: b.answers?.idea || '', start: b.answers?.start || '' },
      }))
    res.json(briefs)
  })

  router.post('/', (req, res) => {
    const briefs = readAll()
    const now = new Date().toISOString()
    const brief = {
      id: randomBytes(5).toString('hex'),
      createdAt: now,
      updatedAt: now,
      answers: req.body?.answers || {},
      step: req.body?.step || 'start',
      reached: 0,
      skipped: [],
      hmwStale: false,
    }
    briefs.push(brief)
    writeAll(briefs)
    res.json(brief)
  })

  router.get('/:id', (req, res) => {
    const brief = readAll().find((b) => b.id === req.params.id)
    if (!brief) return res.status(404).json({ error: 'not found' })
    res.json(brief)
  })

  router.put('/:id', (req, res) => {
    const briefs = readAll()
    const idx = briefs.findIndex((b) => b.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'not found' })
    const { answers, step, reached, skipped, hmwStale } = req.body || {}
    if (answers !== undefined) briefs[idx].answers = answers
    if (step !== undefined) briefs[idx].step = step
    if (reached !== undefined) briefs[idx].reached = reached
    if (skipped !== undefined) briefs[idx].skipped = skipped
    if (hmwStale !== undefined) briefs[idx].hmwStale = hmwStale
    briefs[idx].updatedAt = new Date().toISOString()
    writeAll(briefs)
    res.json(briefs[idx])
  })

  router.delete('/:id', (req, res) => {
    const briefs = readAll().filter((b) => b.id !== req.params.id)
    writeAll(briefs)
    res.json({ ok: true })
  })

  return router
}
