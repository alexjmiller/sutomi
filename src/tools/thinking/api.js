// Thinking Machine — API client. Briefs are stored server-side behind login (the session cookie).
import { notifyUnauthorized } from '../../auth'

const API = '/api/thinking'

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json' } })
  if (res.status === 401) notifyUnauthorized()
  if (!res.ok) throw new Error(`request failed (${res.status})`)
  return res.json()
}

export const listBriefs = () => request('')
export const getBrief = (id) => request(`/${id}`)
export const createBrief = (data) => request('', { method: 'POST', body: JSON.stringify(data) })
export const saveBrief = (id, data) => request(`/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteBrief = (id) => request(`/${id}`, { method: 'DELETE' })
