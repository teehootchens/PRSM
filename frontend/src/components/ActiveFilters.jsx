import { useFilters, DATE_RANGES } from '../FiltersContext'

export default function ActiveFilters() {
  const {
    dateRangeHours, setDateRangeHours,
    minScore, setMinScore,
    beaconType, setBeaconType,
    threatIntelOnly, setThreatIntelOnly,
    protocol, setProtocol,
    globalFilter, setGlobalFilter,
  } = useFilters()

  const active = []

  if (globalFilter)
    active.push({ label: `IP/FQDN: ${globalFilter}`, clear: () => setGlobalFilter('') })

  if (dateRangeHours) {
    const range = DATE_RANGES.find(r => r.hours === dateRangeHours)
    active.push({ label: `Time: ${range?.label || dateRangeHours + 'h'}`, clear: () => setDateRangeHours(null) })
  }

  if (minScore > 0)
    active.push({ label: `Min Score: ${Math.round(minScore * 100)}%`, clear: () => setMinScore(0) })

  if (beaconType)
    active.push({ label: `Type: ${beaconType.toUpperCase()}`, clear: () => setBeaconType('') })

  if (protocol)
    active.push({ label: `Protocol: ${protocol}`, clear: () => setProtocol('') })

  if (threatIntelOnly)
    active.push({ label: '⚠ TI ONLY', clear: () => setThreatIntelOnly(false), warn: true })

  if (active.length === 0) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      flexWrap: 'wrap', marginBottom: '1rem',
      background: '#1e1a0e', border: '1px solid #f97316',
      borderRadius: 8, padding: '0.5rem 0.75rem',
    }}>
      <span style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        ⚠ Active Filters:
      </span>
      {active.map((f, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            background: f.warn ? '#ef444422' : '#2d3148',
            border: `1px solid ${f.warn ? '#ef4444' : '#475569'}`,
            color: f.warn ? '#ef4444' : '#e2e8f0',
            borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: 12,
            fontWeight: f.warn ? 700 : 400,
          }}
        >
          {f.label}
          <button
            onClick={f.clear}
            style={{
              background: 'none', border: 'none', color: 'inherit',
              cursor: 'pointer', fontSize: 13, lineHeight: 1,
              padding: 0, opacity: 0.7,
            }}
            title={`Remove ${f.label} filter`}
          >✕</button>
        </span>
      ))}
      <button
        onClick={() => {
          setGlobalFilter('')
          setDateRangeHours(null)
          setMinScore(0)
          setBeaconType('')
          setProtocol('')
          setThreatIntelOnly(false)
        }}
        style={{
          background: 'none', border: '1px solid #475569', color: '#475569',
          borderRadius: 4, padding: '0.2rem 0.5rem',
          cursor: 'pointer', fontSize: 11, marginLeft: 'auto',
        }}
      >
        Clear All
      </button>
    </div>
  )
}
