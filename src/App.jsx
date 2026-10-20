import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ManageArticles from './pages/ManageArticles'
import QrCreator from './tools/qr/QrCreator'
import ThinkingMachine from './tools/thinking/ThinkingMachine'
import EventHorizon from './tools/eventhorizon/EventHorizon'
import Passkeys from './tools/passkeys/Passkeys'
import { me, logout } from './auth'
import './App.css'

const USER_KEY = 'sutomi_user' // a display-name cache only; the session itself is an HttpOnly cookie

export default function App() {
  const [user, setUser] = useState(() => {
    try { const saved = sessionStorage.getItem(USER_KEY); return saved ? JSON.parse(saved) : null } catch { return null }
  })
  const [checked, setChecked] = useState(false)

  // Ask the server whether the cookie is still good; the cache only avoids a flash.
  useEffect(() => {
    let cancelled = false
    me().then((u) => { if (!cancelled) remember({ name: u.name }) })
      .catch(() => { if (!cancelled) remember(null) })
      .finally(() => { if (!cancelled) setChecked(true) })
    const forget = () => remember(null)
    window.addEventListener('sutomi:unauthorized', forget)
    return () => { cancelled = true; window.removeEventListener('sutomi:unauthorized', forget) }
  }, [])

  function remember(u) {
    setUser(u)
    try {
      if (u) sessionStorage.setItem(USER_KEY, JSON.stringify(u))
      else sessionStorage.removeItem(USER_KEY)
    } catch { /* ignore */ }
  }

  function handleLogin(u) {
    remember({ name: u.name })
    setChecked(true)
  }

  async function handleLogout() {
    try { await logout() } catch { /* the cookie is gone either way */ }
    remember(null)
  }

  // Signed-in pages wait for the cookie check rather than bouncing to login on a fresh tab.
  const gate = (page) => (user ? page : checked ? <Navigate to="/login" /> : null)

  return (
    <BrowserRouter>
      <div className="app">
        <Header user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/article/:id" element={<Home />} />
          <Route path="/login" element={<Login user={user} onLogin={handleLogin} />} />
          <Route path="/dashboard" element={gate(<Dashboard />)} />
          <Route path="/articles" element={gate(<ManageArticles />)} />
          <Route path="/tools/qr" element={gate(<QrCreator />)} />
          <Route path="/tools/thinking" element={gate(<ThinkingMachine />)} />
          <Route path="/tools/thinking/:id" element={gate(<ThinkingMachine />)} />
          <Route path="/tools/eventhorizon/*" element={gate(<EventHorizon />)} />
          <Route path="/tools/passkeys" element={gate(<Passkeys />)} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
