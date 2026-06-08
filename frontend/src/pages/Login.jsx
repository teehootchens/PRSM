import { useState, useEffect } from 'react'
import { useAuth } from '../AuthContext'
import prsmLogo from '../assets/prsm-logo.svg'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [version, setVersion] = useState(null)

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setVersion(d.version))
      .catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (res.status === 401) {
        setError('Invalid username or password')
      } else if (res.ok) {
        const { token } = await res.json()
        login(token)
      } else {
        setError('Unexpected error, try again')
      }
    } catch {
      setError('Could not reach server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0f1117', gap: '1.25rem',
    }}>
      <div style={{
        fontSize: '3.5rem', fontWeight: 700, letterSpacing: '0.3em',
        color: '#2a2f52', userSelect: 'none',
      }}>PRSM</div>

      <div style={{
        background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12,
        padding: '2.5rem', width: 500, display: 'flex', flexDirection: 'column', gap: '1.25rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <img src={prsmLogo} alt="PRSM" style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto 0.5rem' }} />
          <div style={{ color: '#475569', fontSize: 13, marginTop: '0.75rem' }}>Sign in to continue</div>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text" placeholder="Username" value={username}
            onChange={e => setUsername(e.target.value)} required
            autoComplete="username"
            style={{
              background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0',
              padding: '0.6rem 0.75rem', borderRadius: 6, fontSize: 14, outline: 'none',
            }}
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required
            autoComplete="current-password"
            style={{
              background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0',
              padding: '0.6rem 0.75rem', borderRadius: 6, fontSize: 14, outline: 'none',
            }}
          />
          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
          <button
            type="submit" disabled={loading}
            style={{
              background: '#7c85f5', color: '#fff', border: 'none', borderRadius: 6,
              padding: '0.65rem', fontWeight: 600, fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 4,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
        <div style={{
          fontSize: '0.8rem', letterSpacing: '0.25em', color: '#475569',
          userSelect: 'none',
        }}>PATTERN RECOGNITION AND SCORING MATRIX</div>
        {version && (
          <div style={{ fontSize: 11, color: '#475569', userSelect: 'none' }}>
            PRSM v{version}
          </div>
        )}
      </div>
    </div>
  )
}
