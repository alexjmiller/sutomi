// Event Horizon proxy. The browser talks to sutomi only; sutomi forwards to the two Event Horizon
// services with a bearer token, so tokens and service hosts never reach the client.
// A token lands in a *space*: the browser picks one with the X-EH-Space header (default | test)
// and the proxy chooses the token for it.
// Env: EVENTHORIZON_API_TOKEN (Default space), EVENTHORIZON_TEST_TOKEN (Test space),
//      EH_API_URL (substrate), EH_INTERVIEW_URL (interview service).
import { Router } from 'express'

const PROD = process.env.NODE_ENV === 'production'
const API_URL = process.env.EH_API_URL || (PROD ? 'https://api.eventhorizon.nexus' : 'http://localhost:3022')
const INTERVIEW_URL = process.env.EH_INTERVIEW_URL || (PROD ? 'https://interview.eventhorizon.nexus' : 'http://localhost:3036')
const TOKENS = {
  default: process.env.EVENTHORIZON_API_TOKEN || '',
  test: process.env.EVENTHORIZON_TEST_TOKEN || '',
}
const TIMEOUT_MS = 20000

// Only the substrate calls the calendar needs. Everything else stays unreachable from the browser.
const SUBSTRATE_ALLOW = [
  ['GET', /^\/events(\?.*)?$/],
  ['GET', /^\/events\/[^/?]+(\?.*)?$/],
  ['PATCH', /^\/events\/[^/?]+$/],
  ['DELETE', /^\/events\/[^/?]+(\?.*)?$/],
  ['GET', /^\/metrics$/],
  ['GET', /^\/whoami$/],
]

/** Which space the browser asked for, and the token for it. */
function spaceOf(req) {
  const space = String(req.headers['x-eh-space'] || 'default').toLowerCase()
  if (!(space in TOKENS)) return { space, error: `unknown space "${space}"` }
  if (space === 'test' && !TOKENS.test) return { space, error: 'the Test space is not configured on this server (EVENTHORIZON_TEST_TOKEN)' }
  return { space, token: TOKENS[space] }
}

const authHeaders = (token) => (token ? { authorization: `Bearer ${token}` } : {})

async function forward(base, path, req, res) {
  const { token, error } = spaceOf(req)
  if (error) return res.status(400).json({ error })
  const headers = { accept: 'application/json', ...authHeaders(token) }
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

async function probe(url, token) {
  try {
    const r = await fetch(url, { headers: authHeaders(token), signal: AbortSignal.timeout(8000) })
    return r.ok ? 'ok' : r.status === 401 ? 'unauthorized' : `error ${r.status}`
  } catch {
    return 'unreachable'
  }
}

export function eventHorizonRouter() {
  const router = Router()

  // Both services, with the selected space's token.
  router.get('/health', async (req, res) => {
    const { space, token, error } = spaceOf(req)
    if (error) return res.status(400).json({ error })
    const [interview, substrate] = await Promise.all([probe(`${INTERVIEW_URL}/health`), probe(`${API_URL}/whoami`, token)])
    res.json({ space, interview, substrate, token: Boolean(token), spaces: Object.keys(TOKENS).filter((s) => TOKENS[s]) })
  })

  // Who the selected token is: its space and user.
  router.get('/whoami', (req, res) => forward(API_URL, '/whoami', req, res))

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
