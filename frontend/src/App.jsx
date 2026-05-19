import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Beaconing from './pages/Beaconing.jsx'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">RITA GUI</div>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Beaconing
          </NavLink>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Beaconing />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
