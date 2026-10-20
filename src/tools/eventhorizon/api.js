// Event Horizon — API client. Everything goes through sutomi's proxy (/api/eh) behind login.
// The chosen space (Default = the real map, Test = a sandbox) travels as a header; the proxy
// turns it into the right token.
import { notifyUnauthorized } from '../../auth'

const API = '/api/eh'
const SPACE_KEY = 'eh_space'
export const SPACES = ['default', 'test']

export function getSpace() {
  try {
    const s = localStorage.getItem(SPACE_KEY)
    return SPACES.includes(s) ? s : 'default'
  } catch {
    return 'default'
  }
}
export function setSpace(space) {
  try { localStorage.setItem(SPACE_KEY, space) } catch { /* ignore */ }
}

// The sutomi session is a cookie; only the chosen space travels as a header.
const headers = () => ({ 'Content-Type': 'application/json', 'X-EH-Space': getSpace() })

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: headers() })
  if (res.status === 401) notifyUnauthorized()
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!res.ok) throw new Error(data?.error || data?.message || `request failed (${res.status})`)
  return data
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })

export const health = () => request('/health')
export const whoami = () => request('/whoami')

// Interview service
export const getScripts = () => request('/interview/scripts')
export const getNodes = () => request('/interview/nodes')
export const startInterview = (body) => post('/interview/start', body)
export const answer = (state, input, later = false) => post('/interview/answer', later ? { state, input: '', later: true } : { state, input })
export const commit = (instances) => post('/interview/commit', { instances })
export const getDeferred = () => request('/interview/deferred')
export const clearDeferred = (script) => request(`/interview/deferred/${encodeURIComponent(script)}`, { method: 'DELETE' })
export const listInstances = () => request('/interview/instances')
export const removeInstance = (tag) => request(`/interview/instances/${encodeURIComponent(tag)}`, { method: 'DELETE' })
/** Add a step to an instance already on the map: { title, date: 'YYYY-MM-DD', once?: true } → { anchorDate, chain }. */
export const addStep = (tag, step) => post(`/interview/instances/${encodeURIComponent(tag)}/steps`, step)

// Substrate (materialized occurrences)
export const getOccurrences = (params) => request(`/substrate/events?${new URLSearchParams(params)}`)
export const getEvent = (id) => request(`/substrate/events/${id}`)
export const setCompleted = (id, completedAt) => request(`/substrate/events/${id}`, { method: 'PATCH', body: JSON.stringify({ completed_at: completedAt }) })

/** Follow next_cursor until the whole range is in hand. */
export async function fetchAll(params) {
  const items = []
  let cursor = null
  do {
    const page = await getOccurrences(cursor ? { ...params, cursor } : params)
    items.push(...page.items)
    cursor = page.next_cursor
  } while (cursor)
  return items
}
