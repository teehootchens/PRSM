import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

function load(key) {
  try { return JSON.parse(sessionStorage.getItem(key)) } catch { return null }
}
function save(key, val) {
  try { sessionStorage.setItem(key, JSON.stringify(val)) } catch {}
}
function clear(key) {
  try { sessionStorage.removeItem(key) } catch {}
}

export function AuthProvider({ children }) {
  const [credentials, setCredentials] = useState(() => load('rita_auth'))

  const login = (username, password) => {
    const creds = { username, password }
    save('rita_auth', creds)
    setCredentials(creds)
  }

  const logout = () => {
    clear('rita_auth')
    setCredentials(null)
  }

  return (
    <AuthContext.Provider value={{ credentials, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
