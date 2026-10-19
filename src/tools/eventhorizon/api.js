// Event Horizon — API client. Everything goes through sutomi's proxy (/api/eh) behind login.
const API = '/api/eh'

function authHeaders() {
  const user = sessionStorage.getItem('sutomi_user')
  const token = user ? JSON.parse(user).token : ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: authHeaders() })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!res.ok) throw new Error(data?.error || data?.message || `request failed (${res.status})`)
  return data
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })

export const health = () => request('/health')

// Interview service
export const getScripts = () => request('/interview/scripts')
export const getNodes = () => request('/interview/nodes')
export const startInterview = (body) => post('/interview/start', body)
export const answer = (state, input) => post('/interview/answer', { state, input })
export const commit = (instances) => post('/interview/commit', { instances })
export const listInstances = () => request('/interview/instances')
export const removeInstance = (tag) => request(`/interview/instances/${encodeURIComponent(tag)}`, { method: 'DELETE' })

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
