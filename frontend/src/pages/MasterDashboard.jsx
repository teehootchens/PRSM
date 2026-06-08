import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import prsmLogo from '../assets/prsm-logo.svg'

function relativeTime(dateStr) {
  if (!dateStr) return null
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60)     return 'just now'
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function freshnessColor(dateStr) {
  if (!dateStr) return '#475569'
  const diffH = (Date.now() - new Date(dateStr).getTime()) / 3600000
  return diffH < 12 ? '#22c55e' : diffH < 48 ? '#eab308' : '#ef4444'
}

function ProportionBar({ critical, high, medium, low, total }) {
  const t = Math.max(total, 1)
  const bands = [
    { pct: (critical / t) * 100, color: '#ef4444' },
    { pct: (high    / t) * 100, color: '#f97316' },
    { pct: (medium  / t) * 100, color: '#eab308' },
    { pct: (low     / t) * 100, color: '#22c55e' },
  ]
  const hasData = critical + high + medium + low > 0
  return (
    <div style={{
      display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
      background: '#2d3148', marginTop: '0.75rem',
    }}>
      {hasData
        ? bands.filter(b => b.pct > 0).map((b, i) => (
            <div key={i} style={{ width: `${b.pct}%`, background: b.color, minWidth: b.pct > 0 ? 2 : 0 }} />
          ))
        : <div style={{ width: '100%', background: '#2d3148' }} />
      }
    </div>
  )
}

function DatasetCard({ ds, onClick }) {
  const [hovered, setHovered] = useState(false)
  const rel = relativeTime(ds.last_seen)
  const color = freshnessColor(ds.last_seen)
  const diffH = ds.last_seen ? (Date.now() - new Date(ds.last_seen).getTime()) / 3600000 : Infinity
  const isStale = diffH > 24
  const maxPct = Math.round((ds.max_score || 0) * 100)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#1e2235' : '#1a1d27',
        border: '1px solid #2d3148',
        borderRadius: 8,
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0', wordBreak: 'break-all' }}>
          {ds.dataset}
        </div>
        {isStale && (
          <span style={{ fontSize: 11, color: '#eab308', whiteSpace: 'nowrap', flexShrink: 0 }}>⚠ stale</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11 }}>
        <span style={{ color, fontSize: 9 }}>●</span>
        <span style={{ color: '#475569' }}>Last seen</span>
        <span style={{ color, fontWeight: 600 }}>{rel ?? 'never'}</span>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.25rem' }}>
        <div>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
            {ds.total.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Critical</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: ds.critical > 0 ? '#ef4444' : '#475569', fontVariantNumeric: 'tabular-nums' }}>
            {ds.critical.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Score</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: maxPct >= 75 ? '#ef4444' : maxPct >= 50 ? '#f97316' : maxPct >= 25 ? '#eab308' : '#22c55e', fontVariantNumeric: 'tabular-nums' }}>
            {maxPct}%
          </div>
        </div>
      </div>

      <ProportionBar
        critical={ds.critical}
        high={ds.high}
        medium={ds.medium}
        low={ds.low}
        total={ds.total}
      />

      <div style={{ display: 'flex', gap: '0.5rem', fontSize: 10, color: '#475569', marginTop: '0.1rem' }}>
        <span style={{ color: '#ef444488' }}>■</span> Critical
        <span style={{ color: '#f9731688' }}>■</span> High
        <span style={{ color: '#eab30888' }}>■</span> Medium
        <span style={{ color: '#22c55e88' }}>■</span> Low
      </div>
    </div>
  )
}

export default function MasterDashboard() {
  const { authHeader } = useAuth()
  const { setDataset, setDatasets: setContextDatasets } = useDataset()
  const navigate = useNavigate()
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pendingNav, setPendingNav] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDismissed, setUpdateDismissed] = useState(
    () => sessionStorage.getItem('prsm_update_dismissed') === '1'
  )

  useEffect(() => {
    // Dataset summary and update check run in parallel
    axios.get('/api/datasets/summary', { headers: authHeader })
      .then(r => {
        setSummaries(r.data.datasets)
        setContextDatasets(r.data.datasets.map(d => d.dataset))
      })
      .catch(() => setError('Failed to load datasets'))
      .finally(() => setLoading(false))

    axios.get('/api/updates/check', { headers: authHeader })
      .then(r => { if (r.data.update_available) setUpdateAvailable(true) })
      .catch(() => {})
  }, [])

  // Navigate only after state has committed
  useEffect(() => {
    if (pendingNav) navigate('/dashboard')
  }, [pendingNav])

  const handleSelect = (ds) => {
    setDataset(ds.dataset)
    setContextDatasets(summaries.map(d => d.dataset))
    setPendingNav(true)
  }

  const dismissUpdate = () => {
    sessionStorage.setItem('prsm_update_dismissed', '1')
    setUpdateDismissed(true)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0f18',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '3rem 2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        {updateAvailable && !updateDismissed && (
          <div style={{
            background: '#2d1e00',
            border: '1px solid #92400e',
            borderRadius: 6,
            padding: '0.6rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}>
            <span style={{ color: '#fbbf24', fontSize: 13 }}>
              ⚠ A PRSM update is available — run:{' '}
              <code style={{ color: '#fde68a', fontFamily: 'monospace' }}>sudo bash setup.sh --update</code>
            </span>
            <button
              onClick={dismissUpdate}
              aria-label="Dismiss update notification"
              style={{
                background: 'none',
                border: 'none',
                color: '#d97706',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: '0 0.25rem',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2.5rem', gap: '0.75rem' }}>
          <img src={prsmLogo} alt="PRSM" style={{ width: 180 }} />
          <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>Select a dataset to begin analysis</p>
        </div>

        {error && (
          <div style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem' }}>{error}</div>
        )}

        {loading && (
          <div style={{ color: '#7c85f5', textAlign: 'center' }}>Loading datasets…</div>
        )}

        {!loading && !error && summaries.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center' }}>No datasets found.</div>
        )}

        {!loading && summaries.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {summaries.map(ds => (
              <DatasetCard key={ds.dataset} ds={ds} onClick={() => handleSelect(ds)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
