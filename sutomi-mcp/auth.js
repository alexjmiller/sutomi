// Bearer-token checks for the two public endpoints. Each endpoint has its own token so the one in
// the Shortcut (voice) cannot drive the full tool set (mcp). A missing token disables the endpoint
// rather than opening it. Failures are counted per visitor IP (Cloudflare's header first, as the
// domain is proxied) and throttled, and logged without the token.
import { createHash, timingSafeEqual } from 'crypto'

const sha = (s) => createHash('sha256').update(String(s)).digest()
export const safeEqual = (a, b) => Boolean(a) && Boolean(b) && timingSafeEqual(sha(a), sha(b))

export const visitorIp = (req) => String(req.headers['cf-connecting-ip'] || req.ip || '').split(',')[0].trim()

export function failureLimiter({ max = 30, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map() // ip -> { count, resetAt }
  return {
    blocked(ip) {
      const e = hits.get(ip)
      return Boolean(e && e.resetAt > now() && e.count >= max)
    },
    fail(ip) {
      const t = now()
      for (const [k, e] of hits) if (e.resetAt <= t) hits.delete(k)
      const e = hits.get(ip) || { count: 0, resetAt: t + windowMs }
      e.count++
      hits.set(ip, e)
    },
  }
}

/** Express middleware: `Authorization: Bearer <expected>` or 401 (503 while no token is configured). */
export function bearerAuth(expected, { name, log = () => {}, limiter = failureLimiter() }) {
  return (req, res, next) => {
    const ip = visitorIp(req)
    if (!expected) return res.status(503).json({ error: `${name} is not configured` })
    if (limiter.blocked(ip)) { log(`${ip} ${name}: rate limited`); return res.status(429).json({ error: 'too many attempts' }) }
    const header = String(req.headers.authorization || '')
    const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!safeEqual(given, expected)) {
      limiter.fail(ip)
      log(`${ip} ${name}: token refused`)
      res.setHeader('WWW-Authenticate', 'Bearer')
      return res.status(401).json({ error: 'unauthorized' })
    }
    req.auth = { token: '', clientId: name, scopes: [name] } // forwarded to tool handlers as ctx.http.authInfo
    next()
  }
}
