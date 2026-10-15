import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../articles'

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const user = await login(password)
      onLogin(user)
      navigate('/dashboard')
    } catch {
      setError('wrong password')
    }
  }

  return (
    <main className="page">
      <Link to="/" className="back-link">&lt; back</Link>
      <h1 className="article-heading">login</h1>
      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="login-input"
          autoFocus
        />
        <button type="submit" className="login-button">enter</button>
        {error && <p className="login-error">{error}</p>}
      </form>
    </main>
  )
}
