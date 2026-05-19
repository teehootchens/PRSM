import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { DatasetProvider, useDataset } from './DatasetContext'
import { FilterProvider, useFilter } from './FilterContext'
import Beaconing from './pages/Beaconing.jsx'
import LongConns from './pages/LongConns.jsx'
import DNS from './pages/DNS.jsx'
import ThreatIntel from './pages/ThreatIntel.jsx'
import Strobe from './pages/Strobe.jsx'
import Login from './pages/Login.jsx'
import './App.css'

function DatasetPicker() {
  const { datasets, dataset, setDataset } = useDataset()
  if (!datasets.length) return null
  return (
    <select
      value={dataset}
      onChange={e => setDataset(e.target.value)}
      style={{
        background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0',
        padding: '0.35rem 0.6rem', borderRadius: 6, fontSize: 12, width: '100%',
        marginBottom: '0.5rem',
      }}
    >
      {datasets.map(d => <option key={d} value={d}>{d}</option>)}
    </select>
  )
}

function FilterDisplay() {
  const { globalFilter, setGlobalFilter } = useFilter()
  if (!globalFilter) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.4rem',
      background: '#1e2235', borderRadius: 6, padding: '0.35rem 0.6rem',
      marginBottom: '1rem', fontSize: 12,
    }}>
      <span style={{ color: '#93c5fd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        🔍 {globalFilter}
      </span>
      <button
        onClick={() => setGlobalFilter('')}
        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
        title="Clear filter"
      >
        ✕
      </button>
    </div>
  )
}

function Shell() {
  const { logout } = useAuth()

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">RITA GUI</div>
        <DatasetPicker />
        <FilterDisplay />
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Beaconing</NavLink>
        <NavLink to="/longconns" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Long Connections</NavLink>
        <NavLink to="/dns" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>DNS Analysis</NavLink>
        <NavLink to="/threatintel" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Threat Intel</NavLink>
        <NavLink to="/strobe" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Strobe Detection</NavLink>
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #2d3148' }}>
          <button onClick={logout} style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 13, padding: '0.4rem 0', width: '100%', textAlign: 'left',
          }}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Beaconing />} />
          <Route path="/longconns" element={<LongConns />} />
          <Route path="/dns" element={<DNS />} />
          <Route path="/threatintel" element={<ThreatIntel />} />
          <Route path="/strobe" element={<Strobe />} />
        </Routes>
      </main>
    </div>
  )
}

function AuthGate() {
  const { credentials } = useAuth()
  if (!credentials) return <Login />
  return <Shell />
}

export default function App() {
  return (
    <AuthProvider>
      <DatasetProvider>
        <FilterProvider>
          <BrowserRouter>
            <AuthGate />
          </BrowserRouter>
        </FilterProvider>
      </DatasetProvider>
    </AuthProvider>
  )
}
