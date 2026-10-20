import { notifyUnauthorized } from './auth'

// The session cookie travels by itself; a 401 means it has gone, so tell the app.
const API = '/api/articles'
const headers = { 'Content-Type': 'application/json' }

async function checked(res) {
  if (res.status === 401) notifyUnauthorized()
  if (!res.ok) throw new Error(`request failed (${res.status})`)
  return res
}

export async function getWelcome() {
  const res = await fetch('/api/welcome')
  return res.json()
}

export async function getLiveArticles() {
  const res = await fetch(API)
  return res.json()
}

export async function getArticle(id) {
  const articles = await getLiveArticles()
  return articles.find((a) => a.id === id)
}

export async function getAllArticles() {
  const res = await checked(await fetch(`${API}/all`))
  return res.json()
}

export async function createArticle(title, body) {
  const res = await checked(await fetch(API, { method: 'POST', headers, body: JSON.stringify({ title, body }) }))
  return res.json()
}

export async function updateArticle(id, data) {
  const res = await checked(await fetch(`${API}/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) }))
  return res.json()
}

export async function deleteArticle(id) {
  await checked(await fetch(`${API}/${id}`, { method: 'DELETE' }))
}
