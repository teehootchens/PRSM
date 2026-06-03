import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const STORAGE_KEY = 'prsm_token'
const load = () => { try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null } }
const save = (v) => { try { sessionStorage.setItem(STORAGE_KEY, v) } catch {} }
const clear = () => { try { sessionStorage.removeItem(STORAGE_KEY) } catch {} }

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => load())

  const login = (newToken) => {
    save(newToken)
    setToken(newToken)
  }

  const logout = () => {
    clear()
    setToken(null)
  }

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {}

  return (
    <AuthContext.Provider value={{ token, login, logout, authHeader }}>
      {children}
    </AuthContext.Provider>
  )
}
