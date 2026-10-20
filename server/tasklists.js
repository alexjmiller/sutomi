// Tasklists — the generic collection plus PATCH /:id, which merges item operations into the stored
// list instead of replacing it, so several devices can edit one list without clobbering each other.
import { collectionRouter } from './collection.js'
import { validOp, applyOps } from './listops.js'

export function tasklistsRouter(dataFile) {
  return collectionRouter(dataFile, (router, { readAll, writeAll }) => {
    // Body: { name?, ops? } — applied to the current stored list; returns the merged list.
    router.patch('/:id', (req, res) => {
      const lists = readAll()
      const idx = lists.findIndex((l) => l.id === req.params.id)
      if (idx === -1) return res.status(404).json({ error: 'not found' })
      const { name, ops } = req.body || {}
      if (ops !== undefined && (!Array.isArray(ops) || ops.length > 100 || !ops.every(validOp))) {
        return res.status(400).json({ error: 'bad ops' })
      }
      const list = lists[idx]
      if (typeof name === 'string' && name.trim()) list.name = name.trim().slice(0, 120)
      if (ops) list.items = applyOps(list.items || [], ops)
      list.updatedAt = new Date().toISOString()
      writeAll(lists)
      res.json(list)
    })
  })
}
