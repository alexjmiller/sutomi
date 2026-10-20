// Passkeys — the devices that can sign in. Adding or removing one asks for a fresh Touch ID / Face ID
// if the current sign-in is more than a few minutes old. The last passkey cannot be removed here.
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listPasskeys, addPasskey, removePasskey, withFreshSignIn, deviceName } from '../../auth'
import './passkeys.css'

const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never')

export default function Passkeys() {
  const [keys, setKeys] = useState(null)
  const [name, setName] = useState(deviceName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    listPasskeys().then(setKeys).catch((err) => setError(err.message))
  }, [])

  async function run(action) {
    setError('')
    setBusy(true)
    try {
      setKeys(await withFreshSignIn(action))
    } catch (err) {
      setError(err.message || 'something went wrong')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const add = (e) => { e.preventDefault(); run(() => addPasskey(name)) }
  const remove = (id) => run(() => removePasskey(id))

  return (
    <main className="page pk">
      <Link to="/dashboard" className="back-link">&lt; dashboard</Link>
      <h1 className="article-heading">passkeys</h1>
      <p className="pk-intro">
        A passkey lives on a device and signs you in with Touch ID, Face ID or its passcode. One synced
        through iCloud Keychain works on all your Apple devices; add another for any device that doesn't
        share it.
      </p>

      {keys === null && !error && <p className="pk-muted">loading…</p>}
      {keys !== null && keys.length === 0 && (
        <p className="pk-warning">No passkey yet — the password still works until you add one. Add this device now.</p>
      )}
      {keys !== null && keys.length > 0 && (
        <ul className="pk-list">
          {keys.map((k) => (
            <li key={k.id} className="pk-item">
              <div className="pk-item-main">
                <span className="pk-name">{k.name}</span>
                <span className="pk-meta">
                  added {fmt(k.createdAt)} · last used {fmt(k.lastUsedAt)}{k.backedUp ? ' · synced' : ''}
                </span>
              </div>
              {keys.length > 1 && (confirm === k.id ? (
                <span className="pk-confirm">
                  remove?
                  <button type="button" className="pk-text" onClick={() => remove(k.id)} disabled={busy}>yes</button>
                  <button type="button" className="pk-text" onClick={() => setConfirm(null)} disabled={busy}>no</button>
                </span>
              ) : (
                <button type="button" className="pk-text" onClick={() => setConfirm(k.id)} disabled={busy}>remove</button>
              ))}
            </li>
          ))}
        </ul>
      )}

      <form className="pk-add" onSubmit={add}>
        <input
          className="login-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="a name for this device"
          maxLength={60}
        />
        <button type="submit" className="login-button" disabled={busy || !name.trim()}>
          {busy ? 'waiting for the device…' : 'add a passkey for this device'}
        </button>
      </form>
      {error && <p className="login-error">{error}</p>}
      <p className="pk-muted">
        Lost every device? Clearing the passkey file on the server reopens password sign-in.
      </p>
    </main>
  )
}
