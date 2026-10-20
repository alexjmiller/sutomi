// Tasklists — item operations, applied the same way on the server (the source of truth) and in the
// browser (optimistically, before the server answers). Pure: no fs, no DOM. The client bundle imports
// this file too, so keep it dependency-free.
//
// An op is one of
//   { type: 'add', item }                    — append (ignored if that id already exists)
//   { type: 'set', id, patch }               — change fields; a null value removes the field
//   { type: 'remove', id }                   — delete
// Independent items never collide, so two devices editing the same list at once only overwrite
// each other when they touch the very same item — and then the later op wins.

const ITEM_FIELDS = new Set(['id', 'text', 'createdAt', 'done', 'doneAt', 'priority', 'parked'])
const PATCH_FIELDS = new Set(['text', 'done', 'doneAt', 'priority', 'parked'])
const isId = (v) => typeof v === 'string' && /^[a-z0-9]{4,20}$/.test(v)

/** Shape check, so a bad client can't write junk into the file. */
export function validOp(op) {
  if (!op || typeof op !== 'object') return false
  if (op.type === 'add') {
    const it = op.item
    return Boolean(it) && isId(it.id) && typeof it.text === 'string' && it.text.trim() !== '' && typeof it.createdAt === 'number'
      && Object.keys(it).every((k) => ITEM_FIELDS.has(k))
  }
  if (op.type === 'set') {
    return isId(op.id) && Boolean(op.patch) && typeof op.patch === 'object'
      && Object.keys(op.patch).every((k) => PATCH_FIELDS.has(k))
      && (op.patch.priority == null || ['medium', 'high'].includes(op.patch.priority))
      && (op.patch.text === undefined || (typeof op.patch.text === 'string' && op.patch.text.trim() !== ''))
  }
  if (op.type === 'remove') return isId(op.id)
  return false
}

function patched(item, patch) {
  const out = { ...item }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete out[k]
    else out[k] = v
  }
  return out
}

export function applyOp(items, op) {
  switch (op.type) {
    case 'add': return items.some((it) => it.id === op.item.id) ? items : [...items, op.item]
    case 'set': return items.map((it) => (it.id === op.id ? patched(it, op.patch) : it))
    case 'remove': return items.filter((it) => it.id !== op.id)
    default: return items
  }
}

export const applyOps = (items, ops) => ops.reduce(applyOp, items)
