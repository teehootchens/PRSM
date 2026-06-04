import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { useFilters } from '../FiltersContext'
import FilterBar from '../components/FilterBar'
import ChipBar from '../components/ChipBar'
import ContextMenu from '../components/ContextMenu'
import SuppressDialog from '../components/SuppressDialog'
import { usePageChips } from '../hooks/usePageChips'
import { formatIP, applyChips } from '../utils'

function formatDur(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatByt(bytes) {
  if (!bytes) return '—'
  if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function StatCard({ label, value, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#1a1d27', border: `1px solid ${color}44`,
        borderLeft: `4px solid ${color}`, borderRadius: 8,
        padding: '1rem 1.25rem', cursor: 'pointer',
        transition: 'background 0.15s', display: 'flex',
        flexDirection: 'column', gap: '0.3rem',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1e2235'}
      onMouseLeave={e => e.currentTarget.style.background = '#1a1d27'}
    >
      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ color, fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function TopTable({ title, rows, scoreKey, color, onCellClick, onSuppress, extraCols = [] }) {
  const navigate = useNavigate()
  const { setGlobalFilter } = useFilters()
  const [contextMenu, setContextMenu] = useState(null)

  const openValueMenu = (e, row, value, valueType) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: '🚫', label: `Suppress: ${value}`,               onClick: () => onSuppress(row, valueType) },
        { icon: '🔍', label: `Add to global filter: ${value}`,   onClick: () => setGlobalFilter(value) },
        { icon: '🔎', label: `Pivot to Investigate: ${value}`,   onClick: () => navigate('/investigate', { state: { pivot: value } }) },
      ],
    })
  }

  if (!rows || rows.length === 0) return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #2d3148', color, fontWeight: 600, fontSize: 13 }}>{title}</div>
      <div style={{ padding: '1rem', color: '#475569', fontSize: 13 }}>No data</div>
    </div>
  )

  const spanStyle = { color: '#93c5fd', textDecoration: 'underline dotted', cursor: 'pointer' }
  const spanHover = {
    onMouseEnter: e => { e.currentTarget.style.color = '#60a5fa' },
    onMouseLeave: e => { e.currentTarget.style.color = '#93c5fd' },
  }

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, overflow: 'auto' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #2d3148', color, fontWeight: 600, fontSize: 13 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['TI', 'Score', 'Source', 'Destination / FQDN', ...extraCols.map(c => c.label)].map(h => (
              <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#475569', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pct = Math.round((row[scoreKey] || 0) * 100)
            const sc = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e'
            const srcVal = formatIP(row.src)
            const dstType = row.fqdn ? 'fqdn' : 'dst'
            const dstVal = row.fqdn || formatIP(row.dst)
            return (
              <tr key={i} style={{ borderTop: '1px solid #1e2235' }}>
                <td style={{ padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>
                  {row.threat_intel ? <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 12 }}>YES</span> : <span style={{ color: '#475569', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>
                  <span style={{ background: sc + '22', color: sc, border: `1px solid ${sc}55`, borderRadius: 4, padding: '1px 6px', fontWeight: 600, fontSize: 12 }}>{pct}%</span>
                </td>
                <td style={{ padding: '0.4rem 0.75rem', fontSize: 12, whiteSpace: 'nowrap' }}>
                  <span
                    onClick={() => onCellClick(srcVal)}
                    onContextMenu={e => openValueMenu(e, row, srcVal, 'src')}
                    style={spanStyle} title="Left-click to filter · Right-click for options"
                    {...spanHover}
                  >{srcVal}</span>
                </td>
                <td style={{ padding: '0.4rem 0.75rem', fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span
                    onClick={() => onCellClick(dstVal)}
                    onContextMenu={e => openValueMenu(e, row, dstVal, dstType)}
                    style={spanStyle} title="Left-click to filter · Right-click for options"
                    {...spanHover}
                  >{dstVal}</span>
                </td>
                {extraCols.map(c => (
                  <td key={c.label} style={{ padding: '0.4rem 0.75rem', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}

const SERIES = [
  { key: 'beaconing',    label: 'Beaconing',    color: '#7c85f5', dash: false, fill: true  },
  { key: 'threat_intel', label: 'Threat Intel',  color: '#ef4444', dash: [5,3], fill: false },
  { key: 'long_conns',   label: 'Long Conns',    color: '#e2e8f0', dash: [2,2], fill: false },
  { key: 'dns',          label: 'C2/DNS',        color: '#eab308', dash: [4,2], fill: false },
  { key: 'strobe',       label: 'Strobe',        color: '#f97316', dash: [3,3], fill: false },
]

function TrendChart({ data, onApplyRange }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [active, setActive] = useState({ beaconing: true, threat_intel: true, long_conns: true, dns: true, strobe: true })
  const [zoomedRange, setZoomedRange] = useState(null)
  const [isZoomed, setIsZoomed] = useState(false)

  const toggleSeries = (key) => {
    setActive(prev => {
      const next = { ...prev, [key]: !prev[key] }
      if (chartRef.current) {
        const idx = SERIES.findIndex(s => s.key === key)
        const meta = chartRef.current.getDatasetMeta(idx)
        meta.hidden = !next[key]
        chartRef.current.update()
      }
      return next
    })
  }

  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
      setIsZoomed(false)
      setZoomedRange(null)
    }
  }

  useEffect(() => {
    if (!data || data.length === 0 || !canvasRef.current) return
    if (typeof window.Chart === 'undefined') return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const labels = data.map(r => {
      const d = new Date(r.day)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })

    const zoomPlugin = window.ChartZoom

    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: SERIES.map(s => ({
          label: s.label,
          data: data.map(r => r[s.key]),
          borderColor: s.color,
          backgroundColor: s.fill ? s.color + '20' : 'transparent',
          borderWidth: 2,
          borderDash: s.dash || [],
          pointRadius: data.length > 60 ? 1 : 3,
          pointBackgroundColor: s.color,
          tension: 0.35,
          fill: s.fill,
          hidden: !active[s.key],
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#1a1d27', borderColor: '#2d3148', borderWidth: 1, titleColor: '#94a3b8', bodyColor: '#e2e8f0' },
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
          x: { grid: { color: '#1e2235' }, ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 12 } },
          y: { grid: { color: '#1e2235' }, ticks: { color: '#475569', font: { size: 10 } }, beginAtZero: true }
        }
      },
      plugins: zoomPlugin ? [zoomPlugin] : []
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [data])

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
          Detections over time
          {data.length > 60 && <span style={{ color: '#475569', fontWeight: 400, marginLeft: 6 }}>— drag to zoom</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isZoomed && zoomedRange && (
            <>
              <span style={{ fontSize: 11, color: '#7c85f5' }}>{zoomedRange.minLabel} — {zoomedRange.maxLabel}</span>
              <button onClick={() => { if (zoomedRange.minDay && zoomedRange.maxDay && onApplyRange) onApplyRange(zoomedRange.minDay, zoomedRange.maxDay) }}
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
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {SERIES.map(s => {
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
      <div style={{ position: 'relative', height: 260 }}>
        <canvas ref={canvasRef} role="img" aria-label="Line chart showing detection trends over time" />
      </div>
    </div>
  )
}

const DIST_BANDS = [
  { key: 'critical', label: 'Critical', range: '75–100%', color: '#ef4444', floor: 0.75, ceiling: null   },
  { key: 'high',     label: 'High',     range: '50–74%',  color: '#f97316', floor: 0.50, ceiling: 0.7499 },
  { key: 'medium',   label: 'Medium',   range: '25–49%',  color: '#eab308', floor: 0.25, ceiling: 0.4999 },
  { key: 'low',      label: 'Low',      range: '1–24%',   color: '#22c55e', floor: 0.01, ceiling: 0.2499 },
]

function DistChart({ data, selectedBands, onBandClick }) {
  if (!data) return null
  const counts = { critical: data.critical, high: data.high, medium: data.medium, low: data.low }
  const total = Math.max(Object.values(counts).reduce((s, v) => s + v, 0), 1)
  const anySelected = selectedBands.size > 0

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Score distribution</span>
        <span style={{ fontSize: 11, color: '#475569' }}>— click to filter</span>
        {anySelected && (
          <button
            onClick={() => onBandClick(null)}
            style={{ marginLeft: 'auto', background: 'none', border: '1px solid #2d3148', color: '#475569', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontSize: 10 }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {DIST_BANDS.map(band => {
          const count = counts[band.key]
          const isSelected = selectedBands.has(band.key)
          const isDimmed = anySelected && !isSelected
          const barPct = Math.round((count / total) * 100)
          return (
            <div
              key={band.key}
              onClick={() => onBandClick(band.key)}
              style={{
                cursor: 'pointer',
                opacity: isDimmed ? 0.28 : 1,
                transition: 'opacity 0.15s',
                padding: '0.35rem 0.5rem',
                borderRadius: 5,
                background: isSelected ? band.color + '12' : 'transparent',
                border: `1px solid ${isSelected ? band.color + '55' : 'transparent'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                  <span style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? band.color : '#94a3b8', transition: 'color 0.15s' }}>
                    {band.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#475569' }}>{band.range}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? band.color : '#64748b', fontVariantNumeric: 'tabular-nums', transition: 'color 0.15s' }}>
                  {count.toLocaleString()}
                </span>
              </div>
              <div style={{ background: '#0f1117', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${barPct}%`,
                  minWidth: count > 0 ? 3 : 0,
                  borderRadius: 3,
                  background: isSelected ? band.color : band.color + '55',
                  transition: 'background 0.15s',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { authHeader } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const { dateRangeHours, setDateRangeHours, customDateFrom, setCustomDateFrom, customDateTo, setCustomDateTo, minScore, setMinScore, maxScore, setMaxScore, beaconType, threatIntelOnly, setThreatIntelOnly, protocol, showSuppressed } = useFilters()
  const { chips, setChips, addChip, andMode, setAndMode } = usePageChips('dashboard_chips')
  const auth = { headers: authHeader }
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [chartjsLoaded, setChartjsLoaded] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [suppressDialog, setSuppressDialog] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedBands, setSelectedBands] = useState(new Set())
  const bandSyncRef = useRef(false)

  const handleBandClick = (key) => {
    if (key === null) {
      setSelectedBands(new Set())
      bandSyncRef.current = true
      setMinScore(0); setMaxScore(1)
      return
    }
    setSelectedBands(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)

      if (next.size === 0) {
        bandSyncRef.current = true
        setMinScore(0); setMaxScore(1)
        return next
      }

      const floors = [...next].map(k => DIST_BANDS.find(b => b.key === k).floor)
      const floor = Math.min(...floors)
      const highestBand = DIST_BANDS.find(b => next.has(b.key))  // ordered high→low
      const ceil = highestBand?.ceiling ?? null  // null = Critical selected, no upper bound

      bandSyncRef.current = true
      setMinScore(floor)
      setMaxScore(ceil !== null ? ceil : 1)  // 1 = full range (no ceiling)
      return next
    })
  }

  // When either slider handle moves externally, deselect all bands
  useEffect(() => {
    if (bandSyncRef.current) { bandSyncRef.current = false; return }
    setSelectedBands(new Set())
  }, [minScore, maxScore])

  useEffect(() => {
    if (window.Chart && window.ChartZoom) { setChartjsLoaded(true); return }
    const loadScript = (src) => new Promise(resolve => {
      const s = document.createElement('script'); s.src = src; s.onload = resolve; document.head.appendChild(s)
    })
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

  useEffect(() => {
    if (datasets.length) return
    axios.get('/api/datasets', auth)
      .then(r => { setDatasets(r.data.datasets); if (!dataset && r.data.datasets.length > 0) setDataset(r.data.datasets[0]) })
      .catch(() => setError('Could not load datasets'))
  }, [])

  const params = {
    dataset,
    min_score: minScore,
    max_score: maxScore < 1 ? maxScore : undefined,
    since_hours: (dateRangeHours && dateRangeHours !== 'custom') ? dateRangeHours : undefined,
    date_from: dateRangeHours === 'custom' ? customDateFrom || undefined : undefined,
    date_to: dateRangeHours === 'custom' ? customDateTo || undefined : undefined,
    beacon_type: beaconType || undefined,
    threat_intel_only: threatIntelOnly === true ? true : undefined,
    protocol: protocol || undefined,
    show_suppressed: showSuppressed === true ? true : undefined,
  }

  useEffect(() => {
    if (!dataset) return
    setLoading(true); setError(null)
    Promise.all([
      axios.get('/api/dashboard', { ...auth, params }),
      axios.get('/api/charts',   { ...auth, params }),
    ])
      .then(([dash, charts]) => { setData(dash.data); setChartData(charts.data) })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [dataset, minScore, maxScore, dateRangeHours, customDateFrom, customDateTo, beaconType, threatIntelOnly, protocol, showSuppressed, refreshKey])

  const handleApplyRange = (minDay, maxDay) => {
    setDateRangeHours('custom')
    setCustomDateFrom(minDay)
    setCustomDateTo(maxDay)
  }

  const counts = data?.counts || {}
  const timerange = data?.timerange || {}

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5' }}>Dashboard</h1>
        {timerange.earliest && (
          <span style={{ color: '#475569', fontSize: 12 }}>
            Dataset coverage: {new Date(timerange.earliest).toLocaleDateString()} — {new Date(timerange.latest).toLocaleDateString()}
          </span>
        )}
      </div>

      <FilterBar />
      <ChipBar chips={chips} setChips={setChips} andMode={andMode} setAndMode={setAndMode} />

      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#7c85f5' }}>Loading...</div>}

      {!loading && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <StatCard label="Beaconing"        value={counts.beaconing}    color="#7c85f5" onClick={() => navigate('/beaconing')} />
            <StatCard label="Long Connections" value={counts.long_conns}   color="#38bdf8" onClick={() => navigate('/longconns')} />
            <StatCard label="C2 over DNS"      value={counts.dns}          color="#a78bfa" onClick={() => navigate('/dns')} />
            <StatCard label="Threat Intel"     value={counts.threat_intel} color="#ef4444" onClick={() => navigate('/threatintel')} />
            <StatCard label="Strobe"           value={counts.strobe}       color="#f97316" onClick={() => navigate('/strobe')} />
            <StatCard label="TI + Beacon"      value={counts.ti_beaconing} color="#ec4899" onClick={() => { setThreatIntelOnly(true); navigate('/beaconing') }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <TopTable
                title="Top Beaconing Threats"
                rows={applyChips(data.top_beacons || [], chips, andMode)}
                scoreKey="beacon_threat_score"
                color="#7c85f5"
                onCellClick={addChip}
                onSuppress={(row, vt) => setSuppressDialog({ row, valueType: vt })}
                extraCols={[{ label: 'Duration', render: row => formatDur(row.total_duration) }]}
              />
              <TopTable
                title="Top Threat Intel Hits"
                rows={applyChips(data.top_threat_intel || [], chips, andMode)}
                scoreKey="threat_intel_score"
                color="#ef4444"
                onCellClick={addChip}
                onSuppress={(row, vt) => setSuppressDialog({ row, valueType: vt })}
                extraCols={[{ label: 'Feed', render: row => row.modifier_name || '—' }]}
              />
              <TopTable
                title="Top Long Connections"
                rows={applyChips(data.top_long_conns || [], chips, andMode)}
                scoreKey="long_conn_score"
                color="#38bdf8"
                onCellClick={addChip}
                onSuppress={(row, vt) => setSuppressDialog({ row, valueType: vt })}
                extraCols={[
                  { label: 'Duration',    render: row => formatDur(row.total_duration) },
                  { label: 'Total Bytes', render: row => formatByt(row.total_bytes) },
                  { label: 'Connections', render: row => row.count?.toLocaleString() ?? '—' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {chartjsLoaded && chartData && <TrendChart data={chartData.trend} onApplyRange={handleApplyRange} />}
              {chartData && <DistChart data={chartData.distribution} selectedBands={selectedBands} onBandClick={handleBandClick} />}
              {!chartjsLoaded && <div style={{ color: '#475569', fontSize: 13 }}>Loading charts...</div>}
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
      {suppressDialog && (
        <SuppressDialog
          row={suppressDialog.row}
          valueType={suppressDialog.valueType}
          onClose={() => setSuppressDialog(null)}
          onSuccess={() => { setSuppressDialog(null); setRefreshKey(k => k + 1) }}
        />
      )}
    </div>
  )
}
