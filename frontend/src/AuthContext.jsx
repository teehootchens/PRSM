import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [credentials, setCredentials] = useState(null)

  const login = (username, password) => {
    setCredentials({ username, password })
  }

  const logout = () => setCredentials(null)

  return (
    <AuthContext.Provider value={{ credentials, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
