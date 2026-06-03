import { useEffect, useState } from 'react'
import { useFilters, DATE_RANGES } from '../FiltersContext'
import { useDataset } from '../DatasetContext'
import { useAuth } from '../AuthContext'
import axios from 'axios'

export default function FilterBar() {
  const { authHeader } = useAuth()
  const { dataset } = useDataset()
  const {
    dateRangeHours, setDateRangeHours,
    customDateFrom, setCustomDateFrom,
    customDateTo,   setCustomDateTo,
    minScore,       setMinScore,
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
    padding: '0.35rem 0.6rem', borderRadius: 6, fontSize: 12,
    colorScheme: 'dark',
  }

  const hasFilters = dateRangeHours || minScore > 0 || beaconType || protocol || threatIntelOnly || showSuppressed

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

        {/* Custom date pickers */}
        {isCustom && (
          <>
            <input
              type="date"
              value={customDateFrom}
              onChange={e => setCustomDateFrom(e.target.value)}
              style={inputStyle}
            />
            <span style={{ color: '#475569', fontSize: 12 }}>to</span>
            <input
              type="date"
              value={customDateTo}
              onChange={e => setCustomDateTo(e.target.value)}
              style={inputStyle}
            />
          </>
        )}
      </div>

      {/* Min Score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={labelStyle}>Min Score</span>
        <input
          type="range" min="0" max="100" step="1"
          value={Math.round(minScore * 100)}
          onChange={e => setMinScore(Number(e.target.value) / 100)}
          style={{ width: 80, accentColor: '#7c85f5' }}
        />
        <input
          type="number" min="0" max="100" step="1"
          value={Math.round(minScore * 100)}
          onChange={e => {
            const v = Math.min(100, Math.max(0, Number(e.target.value)))
            if (!isNaN(v)) setMinScore(v / 100)
          }}
          onBlur={e => {
            const v = Math.min(100, Math.max(0, Number(e.target.value)))
            setMinScore((isNaN(v) ? 0 : v) / 100)
          }}
          style={{
            width: 48, background: '#0f1117', border: '1px solid #2d3148',
            color: '#7c85f5', fontWeight: 700, fontSize: 12, padding: '0.2rem 0.35rem',
            borderRadius: 4, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span style={{ color: '#475569', fontSize: 12 }}>%</span>
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
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            transition: 'all 0.15s',
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
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            transition: 'all 0.15s',
          }}
        >
          {showSuppressed ? '● Show' : '○ Hide'}
        </button>
      </div>

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={() => {
            setDateRangeHours(null)
            setCustomDateFrom('')
            setCustomDateTo('')
            setMinScore(0)
            setBeaconType('')
            setProtocol('')
            setThreatIntelOnly(false)
            setShowSuppressed(false)
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
