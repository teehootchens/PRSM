import { useState, useRef, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { useFilters } from '../FiltersContext'
import DataTable, { ScoreBadge } from '../components/DataTable'
import FilterBar from '../components/FilterBar'
import { formatIP, formatBytes, formatDuration } from '../utils'

// ── Chip input ──────────────────────────────────────────────────────────────
function ChipInput({ chips, onChange }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  const parseRaw = (raw) => {
    const val = raw.trim()
    if (!val) return null
    // Detect NOT prefix: "!8.8.8.8" or "NOT 8.8.8.8" (case-insensitive)
    const notMatch = val.match(/^(!|NOT\s+)(.+)$/i)
    if (notMatch) return { value: notMatch[2].trim(), negate: true }
    return { value: val, negate: false }
  }

  const add = (raw) => {
    const chip = parseRaw(raw)
    if (!chip) return
    // Deduplicate by value
    if (chips.some(c => c.value === chip.value)) return
    onChange([...chips, chip])
    setInput('')
  }

  const remove = (val) => onChange(chips.filter(c => c.value !== val))

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(input)
    } else if (e.key === ' ' && !input.match(/^not$/i)) {
      e.preventDefault()
      add(input)
    } else if (e.key === 'Backspace' && !input && chips.length) {
      remove(chips[chips.length - 1].value)
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
        alignItems: 'center', minHeight: 42,
        background: '#0f1117', border: '1px solid #2d3148',
        borderRadius: 8, padding: '0.4rem 0.75rem', cursor: 'text',
      }}
    >
      {chips.map(chip => {
        const isNeg = chip.negate
        const chipColor = isNeg ? '#ef4444' : '#7c85f5'
        const chipBg   = isNeg ? '#ef444422' : '#7c85f522'
        const chipBdr  = isNeg ? '#ef444455' : '#7c85f555'
        return (
          <span key={chip.value} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: chipBg, border: `1px solid ${chipBdr}`,
            color: chipColor, borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 600,
          }}>
            {isNeg && <span style={{ fontSize: 11, opacity: 0.85, marginRight: 2 }}>NOT</span>}
            {chip.value}
            <button onClick={() => remove(chip.value)} style={{
              background: 'none', border: 'none', color: chipColor,
              cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7,
            }}>✕</button>
          </span>
        )
      })}
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => input && add(input)}
        placeholder={chips.length ? '' : 'IP, CIDR, or FQDN — prefix with ! or NOT to exclude...'}
        style={{
          flex: 1, minWidth: 200, background: 'none', border: 'none',
          color: '#e2e8f0', fontSize: 13, outline: 'none',
        }}
      />
    </div>
  )
}

// ── Summary cards ────────────────────────────────────────────────────────────
function SummaryCards({ summary }) {
  const pct = Math.round((summary.max_beacon_score || 0) * 100)
  const scoreColor = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e'

  const cards = [
    { label: 'Max Threat Score', value: <span style={{ color: scoreColor, fontWeight: 700 }}>{pct}%</span> },
    { label: 'Total Connections', value: (summary.total_connections || 0).toLocaleString() },
    { label: 'Total Bytes', value: formatBytes(summary.total_bytes) },
    { label: 'First Seen', value: summary.first_seen ? new Date(summary.first_seen).toLocaleDateString() : '—' },
    { label: 'Last Seen', value: summary.last_seen ? new Date(summary.last_seen).toLocaleDateString() : '—' },
    { label: 'TI Hits', value: summary.ti_hits > 0 ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{summary.ti_hits}</span> : '0' },
    { label: 'Max Long Conn', value: <span style={{ color: '#38bdf8' }}>{Math.round((summary.max_long_conn_score || 0) * 100)}%</span> },
    { label: 'Max C2/DNS', value: <span style={{ color: '#a78bfa' }}>{Math.round((summary.max_dns_score || 0) * 100)}%</span> },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '0.75rem 1rem' }}>
          <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{c.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

const INVEST_SERIES = [
  { key: 'connections', label: 'Connections', color: '#7c85f5', dash: false,  fill: true,  yAxis: 'y',  getValue: r => r.connections },
  { key: 'max_score',   label: 'Max Score',   color: '#ef4444', dash: [5,3],  fill: false, yAxis: 'y2', getValue: r => Math.round(r.max_score * 100) },
  { key: 'bytes',       label: 'Bytes',       color: '#38bdf8', dash: [2,2],  fill: false, yAxis: 'y3', getValue: r => r.bytes },
]

function TrendChart({ data, onApplyRange }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [chartjsLoaded, setChartjsLoaded] = useState(!!(window.Chart && window.ChartZoom))
  const [active, setActive] = useState({ connections: true, max_score: true, bytes: true })
  const [zoomedRange, setZoomedRange] = useState(null)
  const [isZoomed, setIsZoomed] = useState(false)

  useEffect(() => {
    if (window.Chart && window.ChartZoom) { setChartjsLoaded(true); return }
    const loadScript = src => new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = res; document.head.appendChild(s) })
    const load = async () => {
      if (!window.Chart) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js')
      if (!window.ChartZoom) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-zoom/2.0.1/chartjs-plugin-zoom.min.js')
        if (window['chartjs-plugin-zoom']) { window.ChartZoom = window['chartjs-plugin-zoom']; window.Chart.register(window.ChartZoom) }
      }
      setChartjsLoaded(true)
    }
    load()
  }, [])

  const toggleSeries = (key) => {
    setActive(prev => {
      const next = { ...prev, [key]: !prev[key] }
      if (chartRef.current) {
        const idx = INVEST_SERIES.findIndex(s => s.key === key)
        const meta = chartRef.current.getDatasetMeta(idx)
        meta.hidden = !next[key]
        chartRef.current.update()
      }
      return next
    })
  }

  const resetZoom = () => {
    if (chartRef.current) { chartRef.current.resetZoom(); setIsZoomed(false); setZoomedRange(null) }
  }

  useEffect(() => {
    if (!chartjsLoaded || !data || data.length === 0 || !canvasRef.current) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const labels = data.map(r => { const d = new Date(r.day); return `${d.getMonth() + 1}/${d.getDate()}` })
    const zoomPlugin = window.ChartZoom

    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: INVEST_SERIES.map(s => ({
          label: s.label,
          data: data.map(s.getValue),
          borderColor: s.color,
          backgroundColor: s.fill ? s.color + '20' : 'transparent',
          borderWidth: 2,
          borderDash: s.dash || [],
          pointRadius: data.length > 60 ? 1 : 3,
          pointBackgroundColor: s.color,
          tension: 0.35,
          fill: s.fill,
          hidden: !active[s.key],
          yAxisID: s.yAxis,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1d27', borderColor: '#2d3148', borderWidth: 1,
            titleColor: '#94a3b8', bodyColor: '#e2e8f0',
            callbacks: {
              label: ctx => {
                if (ctx.dataset.label === 'Bytes') return ` Bytes: ${formatBytes(ctx.parsed.y)}`
                if (ctx.dataset.label === 'Max Score') return ` Score: ${ctx.parsed.y}%`
                return ` Connections: ${ctx.parsed.y}`
              }
            }
          },
          zoom: zoomPlugin ? {
            zoom: {
              drag: { enabled: true, backgroundColor: '#7c85f522', borderColor: '#7c85f5', borderWidth: 1 },
              mode: 'x',
              onZoomComplete: ({ chart }) => {
                setIsZoomed(true)
                const { min, max } = chart.scales.x
                const minDay = data[Math.max(0, Math.round(min))]?.day
                const maxDay = data[Math.min(data.length - 1, Math.round(max))]?.day
                const minLabel = labels[Math.max(0, Math.round(min))]
                const maxLabel = labels[Math.min(labels.length - 1, Math.round(max))]
                setZoomedRange({ minLabel, maxLabel, minDay, maxDay })
              }
            }
          } : {}
        },
        scales: {
          x:  { grid: { color: '#1e2235' }, ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 12 } },
          y:  { position: 'left',  grid: { color: '#1e2235' }, ticks: { color: '#7c85f5', font: { size: 10 } }, beginAtZero: true, title: { display: true, text: 'Connections', color: '#7c85f5', font: { size: 10 } } },
          y2: { position: 'right', grid: { display: false }, ticks: { color: '#ef4444', font: { size: 10 }, callback: v => v + '%' }, beginAtZero: true, max: 100, title: { display: true, text: 'Score %', color: '#ef4444', font: { size: 10 } } },
          y3: { display: false, beginAtZero: true },
        }
      },
      plugins: zoomPlugin ? [zoomPlugin] : []
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [chartjsLoaded, data])

  if (!data || data.length === 0) return null

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
          Activity over time
          {data.length > 60 && <span style={{ color: '#475569', fontWeight: 400, marginLeft: 6 }}>— drag to zoom</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {isZoomed && zoomedRange && (
            <>
              <span style={{ fontSize: 11, color: '#7c85f5' }}>{zoomedRange.minLabel} — {zoomedRange.maxLabel}</span>
              <button onClick={() => onApplyRange && onApplyRange(zoomedRange.minDay, zoomedRange.maxDay)}
                style={{ background: '#7c85f522', border: '1px solid #7c85f5', color: '#7c85f5', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Apply as filter
              </button>
              <button onClick={resetZoom}
                style={{ background: 'none', border: '1px solid #2d3148', color: '#475569', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
                Reset zoom
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toggle buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {INVEST_SERIES.map(s => {
          const on = active[s.key]
          return (
            <button key={s.key} onClick={() => toggleSeries(s.key)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: on ? s.color + '22' : '#1e2235',
              border: `1px solid ${on ? s.color : '#2d3148'}`,
              borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
              color: on ? s.color : '#475569', fontSize: 11, fontWeight: on ? 600 : 400,
              transition: 'all 0.15s',
            }}>
              <span style={{ width: 16, height: 0, display: 'inline-block', borderTop: `2px ${Array.isArray(s.dash) ? 'dashed' : 'solid'} ${on ? s.color : '#475569'}` }} />
              {s.label}
            </button>
          )
        })}
      </div>

      <div style={{ position: 'relative', height: 220 }}>
        <canvas ref={canvasRef} role="img" aria-label="Activity trend chart" />
      </div>
    </div>
  )
}

// ── Category badge ────────────────────────────────────────────────────────────
function CategoryBadge({ row }) {
  const cats = []
  if ((row.beacon_threat_score || 0) > 0) cats.push({ label: 'Beacon', color: '#7c85f5' })
  if ((row.long_conn_score || 0) > 0)     cats.push({ label: 'Long',   color: '#38bdf8' })
  if ((row.c2_over_dns_score || 0) > 0)   cats.push({ label: 'DNS',    color: '#a78bfa' })
  if (row.threat_intel)                   cats.push({ label: 'TI',     color: '#ef4444' })
  if ((row.strobe_score || 0) > 0)        cats.push({ label: 'Strobe', color: '#f97316' })
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {cats.map(c => (
        <span key={c.label} style={{ background: c.color + '22', color: c.color, border: `1px solid ${c.color}55`, borderRadius: 3, padding: '0px 5px', fontSize: 10, fontWeight: 700 }}>
          {c.label}
        </span>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Investigate() {
  const { authHeader } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const { dateRangeHours, setDateRangeHours, customDateFrom, setCustomDateFrom, customDateTo, setCustomDateTo, minScore, beaconType, threatIntelOnly, protocol, showSuppressed, globalFilter, setGlobalFilter } = useFilters()
  const auth = { headers: authHeader }

  const [andMode, setAndMode] = useState(() => { try { return JSON.parse(localStorage.getItem('rita_investigate_and') || 'false') } catch { return false } })
  const setAndModeP = (v) => { try { localStorage.setItem('rita_investigate_and', JSON.stringify(v)) } catch {}; setAndMode(v) }
  const [chips, setChipsState] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('rita_investigate_chips') || '[]')
      return stored.map(c => typeof c === 'string' ? { value: c, negate: false } : c)
    } catch { return [] }
  })
  const setChips = (val) => {
    try { localStorage.setItem('rita_investigate_chips', JSON.stringify(val)) } catch {}
    setChipsState(val)
  }
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Auto-run on mount when dataset is available
  useEffect(() => {
    if (dataset) {
      run()
    }
  }, [dataset])

  useEffect(() => {
    if (datasets.length) return
    axios.get('/api/datasets', auth)
      .then(r => { setDatasets(r.data.datasets); if (!dataset && r.data.datasets.length > 0) setDataset(r.data.datasets[0]) })
      .catch(() => {})
  }, [])

  const run = () => {
    if (!dataset) return
    setLoading(true); setError(null)
    axios.get('/api/investigate', { ...auth, params: {
      dataset,
      limit: 2000,
      targets: chips.filter(c => !c.negate).map(c => c.value).join(','),
      not_targets: chips.filter(c => c.negate).map(c => c.value).join(',') || undefined,
      and_mode: andMode === true ? true : undefined,
      since_hours: (dateRangeHours && dateRangeHours !== 'custom') ? dateRangeHours : undefined,
      date_from: dateRangeHours === 'custom' ? customDateFrom || undefined : undefined,
      date_to: dateRangeHours === 'custom' ? customDateTo || undefined : undefined,
      min_score: minScore || undefined,
      beacon_type: beaconType || undefined,
      threat_intel_only: threatIntelOnly === true ? true : undefined,
      protocol: protocol || undefined,
      show_suppressed: showSuppressed === true ? true : undefined,
    }})
      .then(r => setData(r.data))
      .catch(() => setError('Investigation failed'))
      .finally(() => setLoading(false))
  }

  // Re-run investigation when filters change if we already have results
  useEffect(() => {
    if (data !== null) {
      run()
    }
  }, [chips, andMode, dateRangeHours, customDateFrom, customDateTo, minScore, beaconType, threatIntelOnly, protocol, showSuppressed, dataset])

  const handleApplyRange = (minDay, maxDay) => {
    setDateRangeHours('custom')
    setCustomDateFrom(minDay)
    setCustomDateTo(maxDay)
  }

    const handleCellClick = (value) => {
    if (!value || value === '—') return
    if (!chips.some(c => c.value === value)) {
      setChips([...chips, { value, negate: false }])
    }
  }

  const columns = useMemo(() => [
    { accessorKey: 'beacon_threat_score', header: 'Threat Score', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'src',  header: 'Source',      cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'dst',  header: 'Destination', cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'fqdn', header: 'FQDN',        cell: ({ getValue }) => getValue() || <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'beacon_threat_score', id: 'categories', header: 'Categories',
      cell: ({ row }) => <CategoryBadge row={row.original} /> },
    { accessorKey: 'count',          header: 'Connections' },
    { accessorKey: 'total_bytes',    header: 'Bytes',    cell: ({ getValue }) => formatBytes(getValue()) },
    { accessorKey: 'total_duration', header: 'Duration', cell: ({ getValue }) => formatDuration(getValue()) },
    { accessorKey: 'threat_intel',   header: 'TI Hit',   cell: ({ getValue }) => getValue() ? <span style={{ color: '#ef4444', fontWeight: 700 }}>YES</span> : <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'last_seen',      header: 'Last Seen', cell: ({ getValue }) => new Date(getValue()).toLocaleString() },
  ], [])

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5', marginBottom: '1rem' }}>Investigate</h1>

      <FilterBar />

      {/* Search box */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          Targets — IPs, CIDRs, or FQDNs
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: 11, color: '#475569' }}>Match mode:</span>
              <button
                onClick={() => setAndModeP(false)}
                style={{
                  background: !andMode ? '#7c85f522' : 'none',
                  border: `1px solid ${!andMode ? '#7c85f5' : '#2d3148'}`,
                  color: !andMode ? '#7c85f5' : '#475569',
                  borderRadius: 4, padding: '1px 8px', cursor: 'pointer', fontSize: 11, fontWeight: !andMode ? 700 : 400,
                }}
              >OR</button>
              <button
                onClick={() => setAndModeP(true)}
                style={{
                  background: andMode ? '#eab30822' : 'none',
                  border: `1px solid ${andMode ? '#eab308' : '#2d3148'}`,
                  color: andMode ? '#eab308' : '#475569',
                  borderRadius: 4, padding: '1px 8px', cursor: 'pointer', fontSize: 11, fontWeight: andMode ? 700 : 400,
                }}
              >AND</button>
              {andMode && chips.length > 1 && (
                <span style={{ fontSize: 11, color: '#eab308' }}>showing rows containing ALL targets</span>
              )}
            </div>
            <ChipInput chips={chips} onChange={setChips} />
            <div style={{ fontSize: 11, color: '#475569', marginTop: '0.4rem' }}>
              Press Enter, comma, or space to add. Supports IPs, CIDR ranges (10.0.0.0/24), and FQDNs.
            </div>
          </div>
          <button
            onClick={run}
            disabled={loading}
            style={{
              background: '#7c85f5',
              border: 'none', color: '#fff',
              borderRadius: 8, padding: '0.6rem 1.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Investigating...' : 'Investigate'}
          </button>
          {chips.length > 0 && (
            <button
              onClick={() => { setChips([]) }}
              style={{ background: 'none', border: '1px solid #2d3148', color: '#475569', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer', fontSize: 13 }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#7c85f5' }}>Running investigation...</div>}

      {!loading && data && data.count === 0 && (
        <div style={{ color: '#475569', padding: '2rem', textAlign: 'center' }}>
          No results found for the specified targets in this dataset and time range.
        </div>
      )}

      {!loading && data && data.count > 0 && (
        <>
          <SummaryCards summary={data.summary} />
          <TrendChart data={data.trend} onApplyRange={handleApplyRange} />
          <div style={{ fontSize: 12, color: '#475569', marginBottom: '0.75rem' }}>{data.count} connections found across all threat categories</div>
          <DataTable
            data={data.results}
            columns={columns}
            defaultSort={[{ id: 'beacon_threat_score', desc: true }]}
            onCellClick={handleCellClick}
          />
        </>
      )}
    </div>
  )
}
