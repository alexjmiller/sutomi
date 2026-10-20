// Thinking Machine — server-side persistence for briefs (no AI). Mounted at /api/thinking behind auth.
// The storage is the generic JSON collection; the brief's shape (and v1 -> v2 migration) lives in the client.
export { collectionRouter as thinkingRouter } from './collection.js'
