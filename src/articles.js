const API = '/api/articles'

function getToken() {
  const user = sessionStorage.getItem('sutomi_user')
  if (!user) return null
  return JSON.parse(user).token
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  }
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
  const res = await fetch(`${API}/all`, { headers: authHeaders() })
  return res.json()
}

export async function createArticle(title, body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, body }),
  })
  return res.json()
}

export async function updateArticle(id, data) {
  const res = await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteArticle(id) {
  await fetch(`${API}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

export async function login(password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error('wrong password')
  return res.json()
}
