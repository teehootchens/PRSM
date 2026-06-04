import { useEffect, useState } from 'react'
import { useFilters, DATE_RANGES } from '../FiltersContext'
import { useDataset } from '../DatasetContext'
import { useAuth } from '../AuthContext'
import axios from 'axios'

// ── Dual-handle range slider ─────────────────────────────────────────────────
// Inject thumb CSS once — inline styles can't reach pseudo-elements
if (typeof document !== 'undefined' && !document.getElementById('prsm-dual-range-css')) {
  const s = document.createElement('style')
  s.id = 'prsm-dual-range-css'
  s.textContent = `
    .prsm-dual-range { position: relative; height: 20px; width: 140px; }
    .prsm-dual-range input[type=range] {
      position: absolute; inset: 0; width: 100%; height: 100%;
      -webkit-appearance: none; appearance: none;
      background: transparent; pointer-events: none; outline: none; margin: 0;
    }
    .prsm-dual-range input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 14px; height: 14px; border-radius: 50%;
      background: #7c85f5; cursor: pointer; pointer-events: auto;
      border: 2px solid #0f1117; box-shadow: 0 0 0 1.5px #7c85f5;
      transition: box-shadow 0.1s;
    }
    .prsm-dual-range input[type=range]::-webkit-slider-thumb:hover {
      box-shadow: 0 0 0 3px #7c85f540;
    }
    .prsm-dual-range input[type=range]::-moz-range-thumb {
      width: 14px; height: 14px; border-radius: 50%;
      background: #7c85f5; cursor: pointer; pointer-events: auto;
      border: 2px solid #0f1117; box-shadow: 0 0 0 1.5px #7c85f5;
    }
  `
  document.head.appendChild(s)
}

function DualRangeSlider({ lo, hi, onLo, onHi }) {
  // lo and hi are integers 0-100
  const fill = `linear-gradient(to right,
    #2d3148 0%, #2d3148 ${lo}%,
    #7c85f5 ${lo}%, #7c85f5 ${hi}%,
    #2d3148 ${hi}%, #2d3148 100%)`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7c85f5', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        <span>{lo}%</span>
        <span>{hi}%</span>
      </div>
      <div className="prsm-dual-range">
        {/* Track fill */}
        <div style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          left: 0, right: 0, height: 4, borderRadius: 2,
          background: fill, pointerEvents: 'none',
        }} />
        {/* Min handle — raise z-index when near max so it stays reachable */}
        <input
          type="range" min={0} max={100} step={1} value={lo}
          onChange={e => onLo(Math.min(Number(e.target.value), hi - 1))}
          style={{ zIndex: lo >= hi - 5 ? 5 : 3 }}
        />
        {/* Max handle */}
        <input
          type="range" min={0} max={100} step={1} value={hi}
          onChange={e => onHi(Math.max(Number(e.target.value), lo + 1))}
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  )
}

// ── FilterBar ────────────────────────────────────────────────────────────────
export default function FilterBar() {
  const { authHeader } = useAuth()
  const { dataset } = useDataset()
  const {
    dateRangeHours, setDateRangeHours,
    customDateFrom, setCustomDateFrom,
    customDateTo,   setCustomDateTo,
    minScore,       setMinScore,
    maxScore,       setMaxScore,
    beaconType,     setBeaconType,
    threatIntelOnly,setThreatIntelOnly,
    protocol,       setProtocol,
    showSuppressed, setShowSuppressed,
  } = useFilters()

  const [protocols, setProtocols] = useState([])
  const isCustom = dateRangeHours === 'custom'

  useEffect(() => {
    if (!dataset) return
    axios.get('/api/protocols', { headers: authHeader, params: { dataset } })
      .then(r => setProtocols(r.data.protocols))
      .catch(() => {})
  }, [dataset])

  const lo = Math.round((minScore ?? 0) * 100)
  const hi = Math.round((maxScore ?? 1) * 100)

  const selectStyle = {
    background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0',
    padding: '0.35rem 0.6rem', borderRadius: 6, fontSize: 12,
  }
  const labelStyle = {
    color: '#94a3b8', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
  }
  const inputStyle = {
    background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0',
    padding: '0.35rem 0.6rem', borderRadius: 6, fontSize: 12, colorScheme: 'dark',
  }

  const hasFilters = dateRangeHours || minScore > 0 || maxScore < 1 || beaconType || protocol || threatIntelOnly || showSuppressed

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1rem',
      marginBottom: '1.25rem', flexWrap: 'wrap',
      background: '#1a1d27', border: '1px solid #2d3148',
      borderRadius: 8, padding: '0.6rem 1rem',
    }}>

      {/* Time Range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span style={labelStyle}>Time</span>
        <select
          value={dateRangeHours === 'custom' ? 'custom' : (dateRangeHours ?? '')}
          onChange={e => {
            const val = e.target.value
            if (val === 'custom') {
              setDateRangeHours('custom')
            } else {
              setDateRangeHours(val ? Number(val) : null)
              setCustomDateFrom('')
              setCustomDateTo('')
            }
          }}
          style={selectStyle}
        >
          {DATE_RANGES.map(r => (
            <option key={r.label} value={r.hours === 'custom' ? 'custom' : (r.hours ?? '')}>
              {r.label}
            </option>
          ))}
        </select>
        {isCustom && (
          <>
            <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: '#475569', fontSize: 12 }}>to</span>
            <input type="date" value={customDateTo}   onChange={e => setCustomDateTo(e.target.value)}   style={inputStyle} />
          </>
        )}
      </div>

      {/* Score Range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={labelStyle}>Score</span>
        <DualRangeSlider
          lo={lo} hi={hi}
          onLo={v => setMinScore(v / 100)}
          onHi={v => setMaxScore(v / 100)}
        />
      </div>

      {/* Beacon Type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={labelStyle}>Type</span>
        <select value={beaconType} onChange={e => setBeaconType(e.target.value)} style={selectStyle}>
          <option value="">All</option>
          <option value="ip">IP</option>
          <option value="dns">DNS</option>
        </select>
      </div>

      {/* Protocol */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={labelStyle}>Protocol</span>
        <select value={protocol} onChange={e => setProtocol(e.target.value)} style={selectStyle}>
          <option value="">All</option>
          {protocols.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* TI Only */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={labelStyle}>TI Only</span>
        <button
          onClick={() => setThreatIntelOnly(!threatIntelOnly)}
          style={{
            background: threatIntelOnly ? '#ef444422' : '#1a1d27',
            border: `1px solid ${threatIntelOnly ? '#ef4444' : '#2d3148'}`,
            color: threatIntelOnly ? '#ef4444' : '#64748b',
            borderRadius: 6, padding: '0.25rem 0.6rem',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
          }}
        >
          {threatIntelOnly ? '● ON' : '○ OFF'}
        </button>
      </div>

      {/* Show Suppressed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={labelStyle}>Suppressed</span>
        <button
          onClick={() => setShowSuppressed(!showSuppressed)}
          style={{
            background: showSuppressed ? '#f9731622' : '#1a1d27',
            border: `1px solid ${showSuppressed ? '#f97316' : '#2d3148'}`,
            color: showSuppressed ? '#f97316' : '#64748b',
            borderRadius: 6, padding: '0.25rem 0.6rem',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
          }}
        >
          {showSuppressed ? '● Show' : '○ Hide'}
        </button>
      </div>

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={() => {
            setDateRangeHours(null); setCustomDateFrom(''); setCustomDateTo('')
            setMinScore(0); setMaxScore(1)
            setBeaconType(''); setProtocol('')
            setThreatIntelOnly(false); setShowSuppressed(false)
          }}
          style={{
            background: 'none', border: '1px solid #2d3148', color: '#475569',
            borderRadius: 6, padding: '0.25rem 0.6rem',
            cursor: 'pointer', fontSize: 11, marginLeft: 'auto',
          }}
        >
          Reset Filters
        </button>
      )}
    </div>
  )
}
