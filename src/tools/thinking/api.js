// Thinking Machine — API client. Briefs are stored server-side behind login.
const API = '/api/thinking'

function authHeaders() {
  const user = sessionStorage.getItem('sutomi_user')
  const token = user ? JSON.parse(user).token : ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: authHeaders() })
  if (!res.ok) throw new Error(`request failed (${res.status})`)
  return res.json()
}

export const listBriefs = () => request('')
export const getBrief = (id) => request(`/${id}`)
export const createBrief = (data) => request('', { method: 'POST', body: JSON.stringify(data) })
export const saveBrief = (id, data) => request(`/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteBrief = (id) => request(`/${id}`, { method: 'DELETE' })
