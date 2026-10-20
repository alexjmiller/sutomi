import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { status, loginWithPasskey, loginWithPassword } from '../auth'

export default function Login({ user, onLogin }) {
  const [mode, setMode] = useState(null) // 'passkey' | 'password' | 'closed'
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // Already signed in: straight to the dashboard. (Done here, not as a <Navigate> on the route, so a
  // sign-in that wants another page — the passkeys page after the bootstrap password — isn't overridden.)
  useEffect(() => { if (user) navigate('/dashboard', { replace: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    status().then((s) => {
      if (cancelled) return
      setMode(s.passkeys > 0 ? 'passkey' : s.passwordLogin ? 'password' : 'closed')
    }).catch(() => { if (!cancelled) setMode('closed') })
    return () => { cancelled = true }
  }, [])

  async function usePasskey() {
    setError('')
    setBusy(true)
    try {
      const user = await loginWithPasskey()
      navigate('/dashboard')
      onLogin(user)
    } catch (err) {
      setError(err.message || 'sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function usePassword(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await loginWithPassword(password)
      navigate('/tools/passkeys')
      onLogin(user)
    } catch (err) {
      setError(err.message || 'wrong password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <Link to="/" className="back-link">&lt; back</Link>
      <h1 className="article-heading">login</h1>
      {mode === 'passkey' && (
        <div className="login-form">
          <button type="button" className="login-button" onClick={usePasskey} disabled={busy}>
            {busy ? 'checking…' : 'sign in with passkey'}
          </button>
          <p className="login-hint">Touch ID, Face ID or your device passcode — no password here.</p>
          {error && <p className="login-error">{error}</p>}
        </div>
      )}
      {mode === 'password' && (
        <form onSubmit={usePassword} className="login-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="login-input"
            autoFocus
          />
          <button type="submit" className="login-button" disabled={busy}>enter</button>
          <p className="login-hint">No passkey yet. Sign in with the password once and add one; the password then stops working.</p>
          {error && <p className="login-error">{error}</p>}
        </form>
      )}
      {mode === 'closed' && (
        <p className="login-hint">No way to sign in is set up: no passkey is registered and no password is configured on the server.</p>
      )}
    </main>
  )
}
