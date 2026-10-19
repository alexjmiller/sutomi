// Event Horizon proxy. The browser talks to sutomi only; sutomi forwards to the two Event Horizon
// services with the shared bearer token, so the token and the service hosts never reach the client.
// Env: EVENTHORIZON_API_TOKEN, EH_API_URL (substrate), EH_INTERVIEW_URL (interview service).
import { Router } from 'express'

const PROD = process.env.NODE_ENV === 'production'
const API_URL = process.env.EH_API_URL || (PROD ? 'https://api.eventhorizon.nexus' : 'http://localhost:3022')
const INTERVIEW_URL = process.env.EH_INTERVIEW_URL || (PROD ? 'https://interview.eventhorizon.nexus' : 'http://localhost:3036')
const TOKEN = process.env.EVENTHORIZON_API_TOKEN || ''
const TIMEOUT_MS = 20000

// Only the substrate calls the calendar needs. Everything else stays unreachable from the browser.
const SUBSTRATE_ALLOW = [
  ['GET', /^\/events(\?.*)?$/],
  ['GET', /^\/events\/[^/?]+(\?.*)?$/],
  ['PATCH', /^\/events\/[^/?]+$/],
  ['DELETE', /^\/events\/[^/?]+(\?.*)?$/],
  ['GET', /^\/metrics$/],
]

function authHeaders() {
  return TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}
}

async function forward(base, path, req, res) {
  const headers = { accept: 'application/json', ...authHeaders() }
  const init = { method: req.method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) }
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && req.body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(req.body)
  }
  try {
    const upstream = await fetch(base + path, init)
    const text = await upstream.text()
    res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(text)
  } catch (err) {
    res.status(502).json({ error: `Event Horizon service unreachable (${err.name === 'TimeoutError' ? 'timed out' : err.message})` })
  }
}

export function eventHorizonRouter() {
  const router = Router()

  router.get('/health', async (req, res) => {
    const probe = async (url, withAuth) => {
      try {
        const r = await fetch(url, { headers: withAuth ? authHeaders() : {}, signal: AbortSignal.timeout(8000) })
        return r.ok ? 'ok' : r.status === 401 ? 'unauthorized' : `error ${r.status}`
      } catch {
        return 'unreachable'
      }
    }
    const [interview, substrate] = await Promise.all([probe(`${INTERVIEW_URL}/health`, false), probe(`${API_URL}/metrics`, true)])
    res.json({ interview, substrate, token: Boolean(TOKEN) })
  })

  // Interview service: everything under /interview passes straight through.
  router.use('/interview', (req, res) => forward(INTERVIEW_URL, `/interview${req.url}`, req, res))

  // Substrate: allow-listed only.
  router.use('/substrate', (req, res) => {
    const allowed = SUBSTRATE_ALLOW.some(([method, re]) => method === req.method && re.test(req.url))
    if (!allowed) return res.status(404).json({ error: 'not available through sutomi' })
    forward(API_URL, req.url, req, res)
  })

  return router
}
