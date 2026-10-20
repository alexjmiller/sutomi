// Sign-in with passkeys (WebAuthn), server side. One user (the site owner); any number of devices.
//
// - Credentials live in data/passkeys.json, sessions in data/sessions.json (both in the data volume).
// - A session is a random token in an HttpOnly cookie; the file holds only its hash. The browser never
//   sees a secret it can read, and logging out revokes the session server-side.
// - Touch ID / Face ID (user verification) is required on every assertion and at enrolment.
// - Password sign-in exists only to enrol the first passkey: once one is registered the route closes
//   (403). If every device is lost, clear data/passkeys.json on the server to reopen it.
// - Adding or removing a passkey needs a sign-in within the last few minutes (the client re-asserts).
//
// Env: SUTOMI_RP_ID (default sutomi.net in production, localhost in dev), SUTOMI_ORIGIN (comma list;
// default https://sutomi.net or the local dev origins), SUTOMI_PASSWORD (bootstrap only).
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server'

const PROD = process.env.NODE_ENV === 'production'
const RP_ID = process.env.SUTOMI_RP_ID || (PROD ? 'sutomi.net' : 'localhost')
const ORIGINS = (process.env.SUTOMI_ORIGIN || (PROD ? 'https://sutomi.net' : 'http://localhost:3000,http://localhost:5173'))
  .split(',').map((s) => s.trim()).filter(Boolean)
const RP_NAME = 'sutomi'
const USER_NAME = 'alexander'
const DISPLAY_NAME = 'Alex'
const COOKIE = 'sutomi_session'
const SESSION_DAYS = 30
const CHALLENGE_MS = 2 * 60 * 1000
const FRESH_MS = 10 * 60 * 1000 // how recent a sign-in must be to change the passkey list

// Where a passkey lives, from the authenticator's AAGUID. A synced one (iCloud Keychain, a password manager)
// works from any browser on any device that shares it, so that is a better name than "Mac · Safari".
const PROVIDERS = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
  '50726f74-6f6e-5061-7373-50726f746f6e': 'Proton Pass',
  'b5397666-4885-aa6b-cebf-e52262a439a2': 'Chromium browser',
}

const sha = (s) => createHash('sha256').update(s).digest('hex')
const now = () => Date.now()

function jsonFile(path, empty) {
  return {
    read() {
      if (!existsSync(path)) return structuredClone(empty)
      try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return structuredClone(empty) }
    },
    write(value) {
      const dir = join(path, '..')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(path, JSON.stringify(value, null, 2))
    },
  }
}

/** Minimal cookie parsing — one cookie matters and nothing else is read. */
function cookieValue(req, name) {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

function setCookie(res, value, maxAgeSeconds) {
  const attrs = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`]
  if (PROD) attrs.push('Secure')
  res.setHeader('Set-Cookie', attrs.join('; '))
}

/** The visitor's address: Cloudflare's header when proxied, else what Express derives behind Traefik. */
const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.ip || 'unknown')

/** Sign-in outcomes go to the container log (never the secret itself). */
const log = (req, what) => console.log(`[auth] ${new Date().toISOString()} ${clientIp(req)} ${what}`)

/** A few attempts per client per window on the sign-in routes; everything else is unmetered. */
function rateLimiter({ max, windowMs }) {
  const hits = new Map()
  return (req, res, next) => {
    const key = clientIp(req)
    const t = now()
    const entry = hits.get(key) || { count: 0, start: t }
    if (t - entry.start > windowMs) { entry.count = 0; entry.start = t }
    entry.count += 1
    hits.set(key, entry)
    if (hits.size > 5000) for (const [k, e] of hits) if (t - e.start > windowMs) hits.delete(k)
    if (entry.count > max) { log(req, `rate limited ${req.path}`); return res.status(429).json({ error: 'too many attempts — try again later' }) }
    next()
  }
}

export function authRouter({ dataDir, password }) {
  const passkeys = jsonFile(join(dataDir, 'passkeys.json'), { userId: null, credentials: [] })
  const sessions = jsonFile(join(dataDir, 'sessions.json'), [])
  const challenges = new Map() // challenge -> { kind, expires }
  const router = Router()

  function store() {
    const data = passkeys.read()
    if (!data.userId) { data.userId = randomBytes(16).toString('base64url'); passkeys.write(data) }
    return data
  }
  const passwordOpen = () => Boolean(password) && store().credentials.length === 0

  function rememberChallenge(challenge, kind) {
    for (const [c, e] of challenges) if (e.expires < now()) challenges.delete(c)
    challenges.set(challenge, { kind, expires: now() + CHALLENGE_MS })
  }
  function takeChallenge(kind) {
    return (challenge) => {
      const e = challenges.get(challenge)
      challenges.delete(challenge)
      return Boolean(e && e.kind === kind && e.expires >= now())
    }
  }

  function liveSessions() {
    const t = now()
    return sessions.read().filter((s) => s.expiresAt > t)
  }
  function sessionOf(req) {
    const token = cookieValue(req, COOKIE)
    if (!token) return null
    const hash = sha(token)
    return liveSessions().find((s) => s.hash === hash) || null
  }
  function createSession(res, via) {
    const token = randomBytes(32).toString('base64url')
    const t = now()
    const session = { hash: sha(token), via, createdAt: t, verifiedAt: t, expiresAt: t + SESSION_DAYS * 86400000 }
    sessions.write([...liveSessions(), session])
    setCookie(res, token, SESSION_DAYS * 86400)
    return session
  }
  function refreshSession(session) {
    const all = liveSessions().map((s) => (s.hash === session.hash ? { ...s, verifiedAt: now() } : s))
    sessions.write(all)
  }
  function dropSession(session) {
    sessions.write(liveSessions().filter((s) => s.hash !== session.hash))
  }

  /** Express middleware: a valid session cookie or 401. */
  function requireAuth(req, res, next) {
    const session = sessionOf(req)
    if (!session) return res.status(401).json({ error: 'unauthorized' })
    req.session = session
    next()
  }
  /** Changing the passkey list needs a recent sign-in — unless there is nothing to protect yet. */
  function requireFresh(req, res, next) {
    if (store().credentials.length === 0) return next()
    if (now() - req.session.verifiedAt > FRESH_MS) return res.status(403).json({ error: 'reauth' })
    next()
  }

  const user = () => ({ name: DISPLAY_NAME })
  const publicCredential = (c) => ({
    id: c.id, name: c.name, provider: c.provider || null, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt || null, backedUp: Boolean(c.backedUp),
  })
  const toCredential = (c) => ({ id: c.id, publicKey: Buffer.from(c.publicKey, 'base64url'), counter: c.counter, transports: c.transports })

  const limited = rateLimiter({ max: 20, windowMs: 15 * 60 * 1000 })

  // What the login page should offer.
  router.get('/status', (req, res) => {
    const session = sessionOf(req)
    res.json({ passkeys: store().credentials.length, passwordLogin: passwordOpen(), user: session ? user() : null })
  })

  router.get('/me', requireAuth, (req, res) => {
    res.json({ ...user(), session: { createdAt: req.session.createdAt, verifiedAt: req.session.verifiedAt, expiresAt: req.session.expiresAt } })
  })

  router.post('/logout', (req, res) => {
    const session = sessionOf(req)
    if (session) dropSession(session)
    setCookie(res, '', 0)
    res.json({ ok: true })
  })

  // Bootstrap: the password signs in only while no passkey exists.
  router.post('/password', limited, (req, res) => {
    if (!passwordOpen()) { log(req, 'password sign-in refused: closed'); return res.status(403).json({ error: 'password sign-in is closed — use a passkey' }) }
    const given = Buffer.from(String(req.body?.password || ''))
    const expected = Buffer.from(password)
    const ok = given.length === expected.length && timingSafeEqual(given, expected)
    if (!ok) { log(req, `password sign-in failed (${given.length} chars given, ${expected.length} expected)`); return res.status(401).json({ error: 'wrong password' }) }
    log(req, 'password sign-in ok')
    createSession(res, 'password')
    res.json(user())
  })

  // Sign in with a passkey — or, with a live session, re-verify it for a sensitive change.
  router.post('/login/options', limited, async (_req, res) => {
    const { credentials } = store()
    if (!credentials.length) return res.status(404).json({ error: 'no passkeys yet' })
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map((c) => ({ id: c.id, transports: c.transports })),
      userVerification: 'required',
    })
    rememberChallenge(options.challenge, 'login')
    res.json(options)
  })

  router.post('/login/verify', limited, async (req, res) => {
    const response = req.body?.response
    const data = store()
    const stored = response?.id ? data.credentials.find((c) => c.id === response.id) : null
    if (!stored) return res.status(400).json({ error: 'unknown passkey' })
    let result
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: takeChallenge('login'),
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        credential: toCredential(stored),
        requireUserVerification: true,
      })
    } catch (err) {
      log(req, `passkey sign-in failed: ${err.message}`)
      return res.status(400).json({ error: err.message || 'verification failed' })
    }
    if (!result.verified) { log(req, 'passkey sign-in not verified'); return res.status(401).json({ error: 'not verified' }) }
    log(req, `passkey sign-in ok (${stored.name})`)
    stored.counter = result.authenticationInfo.newCounter
    stored.lastUsedAt = now()
    stored.backedUp = result.authenticationInfo.credentialBackedUp
    passkeys.write(data)
    const existing = sessionOf(req)
    if (existing) refreshSession(existing)
    else createSession(res, 'passkey')
    res.json(user())
  })

  // Managing the passkeys themselves (signed in, and recently so).
  router.get('/passkeys', requireAuth, (_req, res) => {
    res.json(store().credentials.map(publicCredential))
  })

  router.post('/passkeys/options', requireAuth, requireFresh, async (_req, res) => {
    const data = store()
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: USER_NAME,
      userDisplayName: DISPLAY_NAME,
      userID: Buffer.from(data.userId, 'base64url'),
      attestationType: 'none',
      excludeCredentials: data.credentials.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })
    rememberChallenge(options.challenge, 'register')
    res.json(options)
  })

  router.post('/passkeys/verify', requireAuth, requireFresh, async (req, res) => {
    const { response, name, auto } = req.body || {} // auto: the name is the client's own guess, not typed
    let result
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge: takeChallenge('register'),
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      })
    } catch (err) {
      return res.status(400).json({ error: err.message || 'verification failed' })
    }
    if (!result.verified) return res.status(400).json({ error: 'not verified' })
    const { credential, credentialBackedUp, credentialDeviceType, aaguid } = result.registrationInfo
    const data = store()
    if (data.credentials.some((c) => c.id === credential.id)) return res.status(409).json({ error: 'already registered' })
    const provider = PROVIDERS[aaguid] || null
    const typed = String(name || '').trim().slice(0, 60)
    data.credentials.push({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      aaguid,
      provider,
      name: (auto && provider) || typed || provider || 'passkey',
      createdAt: now(),
      lastUsedAt: null,
    })
    passkeys.write(data)
    res.json(data.credentials.map(publicCredential))
  })

  router.patch('/passkeys/:id', requireAuth, (req, res) => {
    const data = store()
    const cred = data.credentials.find((c) => c.id === req.params.id)
    if (!cred) return res.status(404).json({ error: 'not found' })
    const name = String(req.body?.name || '').trim().slice(0, 60)
    if (!name) return res.status(400).json({ error: 'name required' })
    cred.name = name
    passkeys.write(data)
    res.json(data.credentials.map(publicCredential))
  })

  router.delete('/passkeys/:id', requireAuth, requireFresh, (req, res) => {
    const data = store()
    if (!data.credentials.some((c) => c.id === req.params.id)) return res.status(404).json({ error: 'not found' })
    if (data.credentials.length === 1) return res.status(400).json({ error: 'keep at least one passkey' })
    data.credentials = data.credentials.filter((c) => c.id !== req.params.id)
    passkeys.write(data)
    res.json(data.credentials.map(publicCredential))
  })

  return { router, requireAuth, origins: ORIGINS }
}
