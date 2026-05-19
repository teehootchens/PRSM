import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Beaconing from './pages/Beaconing.jsx'
import Login from './pages/Login.jsx'
import './App.css'

function Shell() {
  const { credentials, logout } = useAuth()

  if (!credentials) return <Login />

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">RITA GUI</div>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Beaconing
        </NavLink>
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #2d3148' }}>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              cursor: 'pointer',
              fontSize: 13,
              padding: '0.4rem 0',
              width: '100%',
              textAlign: 'left',
            }}
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Beaconing />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  )
}
