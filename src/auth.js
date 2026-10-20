// Sign-in client. The session is an HttpOnly cookie the server sets; nothing secret is kept here.
// Passkey ceremonies go through @simplewebauthn/browser; Touch ID / Face ID is required by the server.
import { startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser'

const API = '/api/auth'

/** Any API helper that meets a 401 raises this so the app forgets the user. */
export function notifyUnauthorized() {
  window.dispatchEvent(new Event('sutomi:unauthorized'))
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json' } })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!res.ok) {
    const err = new Error(data?.error || `request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) })

/** Words for the browser's own refusals (cancelled, no passkey on this device, …). */
function explain(err) {
  if (err instanceof WebAuthnError || err?.name === 'NotAllowedError') {
    if (err.code === 'ERROR_CEREMONY_ABORTED' || err.name === 'NotAllowedError') return new Error('cancelled, or no passkey offered')
    if (err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return new Error('this device already has a passkey here')
    if (err.code === 'ERROR_AUTHENTICATOR_MISSING_RESIDENT_KEY_SUPPORT') return new Error('this device cannot store a passkey')
  }
  return err
}

export const status = () => request('/status')
export const me = () => request('/me')
export const logout = () => post('/logout')
export const loginWithPassword = (password) => post('/password', { password })

/** Sign in, or (when already signed in) prove it again for a sensitive change. */
export async function loginWithPasskey() {
  const options = await post('/login/options')
  let response
  try { response = await startAuthentication({ optionsJSON: options }) } catch (err) { throw explain(err) }
  return post('/login/verify', { response })
}

export const listPasskeys = () => request('/passkeys')
export const removePasskey = (id) => request(`/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' })

export async function addPasskey(name) {
  const options = await post('/passkeys/options')
  let response
  try { response = await startRegistration({ optionsJSON: options }) } catch (err) { throw explain(err) }
  return post('/passkeys/verify', { response, name })
}

/** Run a passkey-list change; if the sign-in is too old the server asks for a fresh one, so do that and retry. */
export async function withFreshSignIn(action) {
  try {
    return await action()
  } catch (err) {
    if (err.status !== 403 || err.message !== 'reauth') throw err
    await loginWithPasskey()
    return action()
  }
}

/** A sensible default name for the device being enrolled. */
export function deviceName() {
  const ua = navigator.userAgent
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Macintosh/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : 'device'
  const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return browser ? `${device} · ${browser}` : device
}
