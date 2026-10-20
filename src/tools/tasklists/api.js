// Tasklists — API client. Lists are stored server-side behind login (the session cookie).
import { notifyUnauthorized } from '../../auth'

const API = '/api/tasklists'

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json' } })
  if (res.status === 401) notifyUnauthorized()
  if (!res.ok) throw new Error(`request failed (${res.status})`)
  return res.json()
}

export const listLists = () => request('')
export const getList = (id) => request(`/${id}`)
export const createList = (data) => request('', { method: 'POST', body: JSON.stringify(data) })
export const saveList = (id, data) => request(`/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteList = (id) => request(`/${id}`, { method: 'DELETE' })
