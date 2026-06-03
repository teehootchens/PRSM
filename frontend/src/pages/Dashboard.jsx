import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { useFilters } from '../FiltersContext'
import FilterBar from '../components/FilterBar'
import ContextMenu from '../components/ContextMenu'
import SuppressDialog from '../components/SuppressDialog'
import { formatIP } from '../utils'

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

function TopTable({ title, rows, scoreKey, color, onIPClick, extraCols = [], onRowContextMenu }) {
  if (!rows || rows.length === 0) return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #2d3148', color, fontWeight: 600, fontSize: 13 }}>{title}</div>
      <div style={{ padding: '1rem', color: '#475569', fontSize: 13 }}>No data</div>
    </div>
  )
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
            return (
              <tr key={i} style={{ borderTop: '1px solid #1e2235', cursor: 'context-menu' }}
                onContextMenu={e => onRowContextMenu && onRowContextMenu(e, row)}>
                <td style={{ padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>
                  {row.threat_intel ? <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 12 }}>YES</span> : <span style={{ color: '#475569', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>
                  <span style={{ background: sc + '22', color: sc, border: `1px solid ${sc}55`, borderRadius: 4, padding: '1px 6px', fontWeight: 600, fontSize: 12 }}>{pct}%</span>
                </td>
                <td style={{ padding: '0.4rem 0.75rem', color: '#93c5fd', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
                  onClick={() => onIPClick(formatIP(row.src))} title={`Filter by ${formatIP(row.src)}`}>
                  {formatIP(row.src)}
                </td>
                <td style={{ padding: '0.4rem 0.75rem', color: '#93c5fd', cursor: 'pointer', fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => onIPClick(row.fqdn || formatIP(row.dst))}
                  title={`Filter by ${row.fqdn || formatIP(row.dst)}`}>
                  {row.fqdn || formatIP(row.dst)}
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

function DistChart({ data }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!data || !canvasRef.current) return
    if (typeof window.Chart === 'undefined') return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const total = (data.critical + data.high + data.medium + data.low) || 1

    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: [
          `Critical >=75% (${data.critical})`,
          `High 50-75% (${data.high})`,
          `Medium 25-50% (${data.medium})`,
          `Low <25% (${data.low})`,
        ],
        datasets: [{
          data: [data.critical, data.high, data.medium, data.low],
          backgroundColor: ['#ef444488', '#f9731688', '#eab30888', '#22c55e88'],
          borderColor:     ['#ef4444',   '#f97316',   '#eab308',   '#22c55e'],
          borderWidth: 1, borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1d27', borderColor: '#2d3148', borderWidth: 1,
            titleColor: '#94a3b8', bodyColor: '#e2e8f0',
            callbacks: { label: ctx => ` ${ctx.parsed.x} detections (${Math.round((ctx.parsed.x / total) * 100)}%)` }
          }
        },
        scales: {
          x: { grid: { color: '#1e2235' }, ticks: { color: '#475569', font: { size: 10 } }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }
        }
      }
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [data])

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: '0.75rem' }}>Score distribution</div>
      <div style={{ position: 'relative', height: 160 }}>
        <canvas ref={canvasRef} role="img" aria-label="Horizontal bar chart showing score distribution" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { authHeader } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const { dateRangeHours, setDateRangeHours, customDateFrom, setCustomDateFrom, customDateTo, setCustomDateTo, minScore, beaconType, threatIntelOnly, setThreatIntelOnly, protocol, showSuppressed, globalFilter, setGlobalFilter } = useFilters()
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
  }, [dataset, minScore, dateRangeHours, customDateFrom, customDateTo, beaconType, threatIntelOnly, protocol, showSuppressed, refreshKey])

  const handleIPClick = (ip) => {
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) return
    setGlobalFilter(ip)
  }

  const handleApplyRange = (minDay, maxDay) => {
    setDateRangeHours('custom')
    setCustomDateFrom(minDay)
    setCustomDateTo(maxDay)
  }

  const handleRowContextMenu = (e, row) => {
    e.preventDefault()
    const srcIP = formatIP(row.src)
    const dstIP = formatIP(row.dst)
    const fqdn  = row.fqdn
    const items = []
    if (srcIP) items.push({ icon: 'X', label: `Suppress src: ${srcIP}`, onClick: () => setSuppressDialog({ row, valueType: 'src' }) })
    if (dstIP) items.push({ icon: 'X', label: `Suppress dst: ${dstIP}`, onClick: () => setSuppressDialog({ row, valueType: 'dst' }) })
    if (fqdn)  items.push({ icon: 'X', label: `Suppress FQDN: ${fqdn}`, onClick: () => setSuppressDialog({ row, valueType: 'fqdn' }) })
    items.push('divider')
    items.push({ icon: 'F', label: `Filter by ${srcIP}`, onClick: () => setGlobalFilter(srcIP) })
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const filterRows = (rows) => {
    if (!globalFilter || !rows) return rows
    return rows.filter(row =>
      formatIP(row.src).includes(globalFilter) ||
      formatIP(row.dst).includes(globalFilter) ||
      (row.fqdn || '').includes(globalFilter)
    )
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input
          placeholder="Search IP or FQDN..."
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          style={{ background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0', padding: '0.4rem 0.75rem', borderRadius: 6, width: 280, fontSize: 13 }}
        />
        {globalFilter && (
          <button onClick={() => setGlobalFilter('')} style={{ background: '#2d3148', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: 12 }}>
            Clear
          </button>
        )}
      </div>

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
                rows={filterRows(data.top_beacons)}
                scoreKey="beacon_threat_score"
                color="#7c85f5"
                onIPClick={ip => handleIPClick(ip)}
                onRowContextMenu={handleRowContextMenu}
                extraCols={[{ label: 'Duration', render: row => formatDur(row.total_duration) }]}
              />
              <TopTable
                title="Top Threat Intel Hits"
                rows={filterRows(data.top_threat_intel)}
                scoreKey="threat_intel_score"
                color="#ef4444"
                onIPClick={ip => handleIPClick(ip)}
                onRowContextMenu={handleRowContextMenu}
                extraCols={[{ label: 'Feed', render: row => row.modifier_name || '—' }]}
              />
              <TopTable
                title="Top Long Connections"
                rows={filterRows(data.top_long_conns)}
                scoreKey="long_conn_score"
                color="#38bdf8"
                onIPClick={ip => handleIPClick(ip)}
                onRowContextMenu={handleRowContextMenu}
                extraCols={[
                  { label: 'Duration',    render: row => formatDur(row.total_duration) },
                  { label: 'Total Bytes', render: row => formatByt(row.total_bytes) },
                  { label: 'Connections', render: row => row.count?.toLocaleString() ?? '—' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {globalFilter && (
                <div style={{ background: '#1e2235', border: '1px solid #2d3148', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: 12, color: '#64748b' }}>
                  Charts show dataset totals — IP filter applies to tables only
                </div>
              )}
              {chartjsLoaded && chartData && <TrendChart data={chartData.trend} onApplyRange={handleApplyRange} />}
              {chartjsLoaded && chartData && <DistChart data={chartData.distribution} />}
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
