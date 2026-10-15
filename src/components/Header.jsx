import { Link } from 'react-router-dom'

export default function Header({ user, onLogout }) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <header className="header">
      <div className="header-left">
        <Link to="/" className="logo">
          <img src="/sutomi-logo.svg" alt="sutomi" className="logo-icon" />
          <span className="logo-text">sutomi</span>
        </Link>
      </div>
      <div className="header-center">
        <span>Todays date:</span>
        <span className="date">{dateStr}</span>
      </div>
      <div className="header-right">
        {user ? (
          <button className="login-link" onClick={onLogout}>{user.name}</button>
        ) : (
          <Link to="/login" className="login-link">login</Link>
        )}
      </div>
    </header>
  )
}
