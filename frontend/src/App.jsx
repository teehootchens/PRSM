import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { AuthProvider, useAuth } from './AuthContext'
import { DatasetProvider, useDataset } from './DatasetContext'
import { FiltersProvider, useFilters } from './FiltersContext'
import Dashboard from './pages/Dashboard.jsx'
import MasterDashboard from './pages/MasterDashboard.jsx'
import Beaconing from './pages/Beaconing.jsx'
import LongConns from './pages/LongConns.jsx'
import DNS from './pages/DNS.jsx'
import ThreatIntel from './pages/ThreatIntel.jsx'
import Strobe from './pages/Strobe.jsx'
import Whitelist from './pages/Whitelist.jsx'
import Investigate from './pages/Investigate.jsx'
import Login from './pages/Login.jsx'
import HelpPanel from './components/HelpPanel.jsx'
import './App.css'
import prsmLogo from './assets/prsm-logo.svg'

function DatasetPicker() {
  const { datasets, dataset, setDataset } = useDataset()
  if (!datasets.length) return null
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{
        fontSize: 10, color: '#475569', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: '0.25rem',
      }}>
        Dataset
      </div>
      <select
        value={dataset}
        onChange={e => setDataset(e.target.value)}
        style={{
          background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0',
          padding: '0.35rem 0.6rem', borderRadius: 6, fontSize: 12, width: '100%',
        }}
      >
        {datasets.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  )
}

function ActiveFiltersBadge() {
  const {
    dateRangeHours, setDateRangeHours,
    customDateFrom, setCustomDateFrom,
    customDateTo, setCustomDateTo,
    minScore, setMinScore,
    beaconType, setBeaconType,
    threatIntelOnly, setThreatIntelOnly,
    protocol, setProtocol,
    showSuppressed, setShowSuppressed,
    globalFilter, setGlobalFilter,
  } = useFilters()

  const active = [
    globalFilter && { label: `IP: ${globalFilter}`, clear: () => setGlobalFilter('') },
    dateRangeHours && dateRangeHours !== 'custom' && { label: `Time filter`, clear: () => setDateRangeHours(null) },
    dateRangeHours === 'custom' && (customDateFrom || customDateTo) && { label: `${customDateFrom || '?'} to ${customDateTo || '?'}`, clear: () => { setDateRangeHours(null); setCustomDateFrom(''); setCustomDateTo('') } },
    minScore > 0 && { label: `Score ≥ ${Math.round(minScore * 100)}%`, clear: () => setMinScore(0) },
    beaconType && { label: `Type: ${beaconType}`, clear: () => setBeaconType('') },
    protocol && { label: protocol, clear: () => setProtocol('') },
    threatIntelOnly && { label: '⚠ TI ONLY', clear: () => setThreatIntelOnly(false), warn: true },
    showSuppressed && { label: '👁 SHOW SUPPRESSED', clear: () => setShowSuppressed(false), warn: false },
  ].filter(Boolean)

  if (active.length === 0) return null

  return (
    <div style={{
      background: '#1e1a0e',
      border: '1px solid #f97316',
      borderRadius: 6,
      padding: '0.4rem 0.6rem',
      marginBottom: '0.75rem',
      fontSize: 11,
    }}>
      <div style={{ color: '#f97316', fontWeight: 700, marginBottom: '0.3rem' }}>
        ⚠ {active.length} FILTER{active.length > 1 ? 'S' : ''} ACTIVE
      </div>
      {active.map((f, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: f.warn ? '#ef4444' : '#94a3b8',
          fontWeight: f.warn ? 700 : 400,
          padding: '1px 0',
        }}>
          <span>{f.label}</span>
          <button
            onClick={f.clear}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: 0 }}
          >✕</button>
        </div>
      ))}
      <button
        onClick={() => {
          setGlobalFilter(''); setDateRangeHours(null); setCustomDateFrom(''); setCustomDateTo(''); setMinScore(0)
          setBeaconType(''); setProtocol(''); setThreatIntelOnly(false); setShowSuppressed(false)
        }}
        style={{
          marginTop: '0.3rem', background: 'none', border: '1px solid #475569',
          color: '#475569', borderRadius: 4, padding: '0.15rem 0.4rem',
          cursor: 'pointer', fontSize: 10, width: '100%',
        }}
      >
        Clear All
      </button>
    </div>
  )
}

function relativeTime(dateStr) {
  if (!dateStr) return null
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60)     return 'just now'
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function LastIngestedBadge() {
  const { dataset } = useDataset()
  const { authHeader } = useAuth()
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!dataset) return
    axios.get('/api/datasets/last_seen', { headers: authHeader, params: { dataset } })
      .then(r => setInfo(r.data))
      .catch(() => {})
  }, [dataset])

  if (!info?.last_seen) return null

  const rel = relativeTime(info.last_seen)
  const diffH = (Date.now() - new Date(info.last_seen).getTime()) / 3600000
  const color = diffH < 12 ? '#22c55e' : diffH < 48 ? '#eab308' : '#ef4444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ color, fontSize: 9 }}>●</span>
      <span style={{ fontSize: 11, color: '#475569' }}>RITA last saw data</span>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{rel}</span>
    </div>
  )
}

function Shell() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="app">
      <nav className="sidebar">
        <div
          className="logo"
          onClick={() => navigate('/')}
          style={{ cursor: 'pointer' }}
        >
          <img src={prsmLogo} alt="PRSM" style={{ width: '100%', display: 'block' }} />
        </div>
        <DatasetPicker />
        <ActiveFiltersBadge />
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Dashboard</NavLink>
        <NavLink to="/investigate" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Investigate</NavLink>
        <NavLink to="/beaconing" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Beaconing</NavLink>
        <NavLink to="/longconns" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Long Connections</NavLink>
        <NavLink to="/dns" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>DNS Analysis</NavLink>
        <NavLink to="/strobe" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Strobe Detection</NavLink>
        <NavLink to="/threatintel" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Threat Intel</NavLink>
        <NavLink to="/whitelist" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Suppression List</NavLink>
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #2d3148' }}>
          <button onClick={logout} style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 13, padding: '0.4rem 0', width: '100%', textAlign: 'left',
          }}>Sign out</button>
        </div>
      </nav>
      <main className="content">
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <button
            onClick={() => setHelpOpen(true)}
            style={{
              background: 'none', border: '1px solid #2d3148', color: '#475569',
              borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >?</button>
          <LastIngestedBadge />
        </div>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/beaconing" element={<Beaconing />} />
          <Route path="/longconns" element={<LongConns />} />
          <Route path="/dns" element={<DNS />} />
          <Route path="/threatintel" element={<ThreatIntel />} />
          <Route path="/strobe" element={<Strobe />} />
          <Route path="/investigate" element={<Investigate />} />
          <Route path="/whitelist" element={<Whitelist />} />
        </Routes>
      </main>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

function AuthGate() {
  const { token } = useAuth()
  if (!token) return <Login />
  return (
    <Routes>
      <Route path="/" element={<MasterDashboard />} />
      <Route path="/*" element={<Shell />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DatasetProvider>
        <FiltersProvider>
          <BrowserRouter>
            <AuthGate />
          </BrowserRouter>
        </FiltersProvider>
      </DatasetProvider>
    </AuthProvider>
  )
}
