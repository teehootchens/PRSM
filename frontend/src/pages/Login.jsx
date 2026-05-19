import { useState } from 'react'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/datasets', {
        headers: {
          'Authorization': 'Basic ' + btoa(`${username}:${password}`)
        }
      })
      if (res.status === 401) {
        setError('Invalid username or password')
      } else if (res.ok) {
        login(username, password)
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
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0f1117',
    }}>
      <div style={{
        background: '#1a1d27',
        border: '1px solid #2d3148',
        borderRadius: 12,
        padding: '2.5rem',
        width: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#7c85f5', marginBottom: 4 }}>
            RITA GUI
          </div>
          <div style={{ color: '#475569', fontSize: 13 }}>
            Sign in to continue
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            style={{
              background: '#0f1117',
              border: '1px solid #2d3148',
              color: '#e2e8f0',
              padding: '0.6rem 0.75rem',
              borderRadius: 6,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              background: '#0f1117',
              border: '1px solid #2d3148',
              color: '#e2e8f0',
              padding: '0.6rem 0.75rem',
              borderRadius: 6,
              fontSize: 14,
              outline: 'none',
            }}
          />
          {error && (
            <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#7c85f5',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '0.65rem',
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
