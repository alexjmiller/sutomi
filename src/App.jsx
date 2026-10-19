import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ManageArticles from './pages/ManageArticles'
import QrCreator from './tools/qr/QrCreator'
import './App.css'

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('sutomi_user')
    return saved ? JSON.parse(saved) : null
  })

  function handleLogin(u) {
    setUser(u)
    sessionStorage.setItem('sutomi_user', JSON.stringify(u))
  }

  function handleLogout() {
    setUser(null)
    sessionStorage.removeItem('sutomi_user')
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Header user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/article/:id" element={<Home />} />
          <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/articles" element={user ? <ManageArticles /> : <Navigate to="/login" />} />
          <Route path="/tools/qr" element={user ? <QrCreator /> : <Navigate to="/login" />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
