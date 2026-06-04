import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { useFilters } from '../FiltersContext'
import DataTable, { ScoreBadge } from '../components/DataTable'
import FilterBar from '../components/FilterBar'
import ContextMenu from '../components/ContextMenu'
import SuppressDialog from '../components/SuppressDialog'
import { formatIP, formatBytes, formatDuration } from '../utils'
import ChipBar, { detectChipType } from '../components/ChipBar'

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

// ── Shared Hosts panel ────────────────────────────────────────────────────────
function SharedHostsPanel({ target, dataset, auth, onAddChip, chips, setChips, sinceHours, dateFrom, dateTo, minScore, maxScore, showSuppressed }) {
  const navigate = useNavigate()
  const { setGlobalFilter } = useFilters()
  const [hosts, setHosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [suppressDialog, setSuppressDialog] = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    axios.get('/api/investigate/shared-hosts', {
      ...auth,
      params: {
        dataset,
        target,
        since_hours:    sinceHours   || undefined,
        date_from:      dateFrom     || undefined,
        date_to:        dateTo       || undefined,
        min_score:      minScore     || undefined,
        max_score:      (maxScore != null && maxScore < 1) ? maxScore : undefined,
        show_suppressed: showSuppressed || undefined,
      },
    })
      .then(r => setHosts(r.data.hosts))
      .catch(() => setError('Failed to load shared hosts'))
      .finally(() => setLoading(false))
  }, [target, dataset, sinceHours, dateFrom, dateTo, minScore, maxScore, showSuppressed])

  const handleRightClick = (e, src) => {
    e.preventDefault()
    const ip = formatIP(src)
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: '🚫', label: `Suppress: ${ip}`,              onClick: () => setSuppressDialog({ row: { src }, valueType: 'src' }) },
        { icon: '🔍', label: `Add to global filter: ${ip}`,  onClick: () => setGlobalFilter(ip) },
        { icon: '🔎', label: `Pivot to Investigate: ${ip}`,  onClick: () => navigate('/investigate', { state: { pivot: ip } }) },
      ],
    })
  }

  const investigateAll = () => {
    const existing = new Set(chips.map(c => c.value))
    const newChips = hosts
      .map(h => formatIP(h.src))
      .filter(ip => ip && ip !== '—' && !existing.has(ip))
      .map(ip => ({ value: ip, negate: false, type: 'target' }))
    if (newChips.length > 0) setChips([...chips, ...newChips])
  }

  const TH = { padding: '0.35rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2d3148', whiteSpace: 'nowrap', background: '#1a1d27' }
  const TD = { padding: '0.4rem 0.75rem', borderBottom: '1px solid #1e2235' }

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: '0.75rem' }}>
        Internal hosts communicating with{' '}
        <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{target}</span>
      </div>

      {loading && <div style={{ color: '#7c85f5', fontSize: 13 }}>Loading...</div>}
      {error   && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

      {!loading && !error && hosts.length === 0 && (
        <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '1.5rem 0' }}>
          No internal hosts found communicating with this destination.
        </div>
      )}

      {!loading && !error && hosts.length > 0 && (
        <>
          <div style={{ overflowY: 'auto', maxHeight: 280 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={TH}>Source IP</th>
                  <th style={{ ...TH, minWidth: 160 }}>Threat Score</th>
                  <th style={TH}>Connections</th>
                  <th style={TH}>Total Bytes</th>
                  <th style={TH}>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h, i) => {
                  const ip    = formatIP(h.src)
                  const pct   = Math.round((h.max_threat_score || 0) * 100)
                  const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#475569'
                  return (
                    <tr key={h.src} style={{ background: i % 2 === 0 ? '#0f1117' : '#13161f' }}>
                      <td style={TD}>
                        <span
                          onClick={() => onAddChip(ip)}
                          onContextMenu={e => handleRightClick(e, h.src)}
                          onMouseEnter={e => { e.currentTarget.style.color = '#60a5fa' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#93c5fd' }}
                          style={{ color: '#93c5fd', textDecoration: 'underline dotted', cursor: 'pointer', fontFamily: 'monospace' }}
                          title="Left-click to filter · Right-click for options"
                        >
                          {ip}
                        </span>
                      </td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: 6, background: '#2d3148', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ ...TD, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                        {(h.total_connections || 0).toLocaleString()}
                      </td>
                      <td style={{ ...TD, color: '#94a3b8' }}>
                        {formatBytes(h.total_bytes)}
                      </td>
                      <td style={{ ...TD, color: '#475569', whiteSpace: 'nowrap' }}>
                        {h.last_seen ? new Date(h.last_seen).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              onClick={investigateAll}
              style={{ background: '#7c85f522', border: '1px solid #7c85f5', color: '#7c85f5', borderRadius: 6, padding: '0.35rem 1rem', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              Investigate all sources ({hosts.length})
            </button>
          </div>
        </>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
      )}
      {suppressDialog && (
        <SuppressDialog
          row={suppressDialog.row}
          valueType={suppressDialog.valueType}
          onClose={() => setSuppressDialog(null)}
          onSuccess={() => setSuppressDialog(null)}
        />
      )}
    </div>
  )
}

// ── Category badge ────────────────────────────────────────────────────────────
function CategoryBadge({ row }) {
  const cats = []
  if ((row.beacon_score || 0) > 0)        cats.push({ label: 'Beacon', color: '#7c85f5' })
  if ((row.long_conn_score || 0) > 0)     cats.push({ label: 'Long',   color: '#38bdf8' })
  if ((row.c2_over_dns_score || 0) > 0)   cats.push({ label: row.subdomain_count > 0 ? `DNS • ${row.subdomain_count}` : 'DNS', color: '#a78bfa' })
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
  const location = useLocation()
  const { authHeader } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const { dateRangeHours, setDateRangeHours, customDateFrom, setCustomDateFrom, customDateTo, setCustomDateTo, minScore, setMinScore, maxScore, beaconType, threatIntelOnly, protocol, showSuppressed, globalFilter, setGlobalFilter } = useFilters()
  const auth = { headers: authHeader }

  const pivotValue = location.state?.pivot ?? null

  const [andMode, setAndMode] = useState(() => { try { return JSON.parse(localStorage.getItem('rita_investigate_and') || 'false') } catch { return false } })
  const setAndModeP = (v) => { try { localStorage.setItem('rita_investigate_and', JSON.stringify(v)) } catch {}; setAndMode(v) }
  const [chips, setChipsState] = useState(() => {
    if (pivotValue) {
      return [{ value: pivotValue, negate: false, type: detectChipType(pivotValue) }]
    }
    try {
      const stored = JSON.parse(localStorage.getItem('rita_investigate_chips') || '[]')
      return stored.map(c => {
        const chip = typeof c === 'string' ? { value: c, negate: false } : { ...c }
        if (!chip.type) chip.type = detectChipType(chip.value)
        return chip
      })
    } catch { return [] }
  })
  const setChips = (val) => {
    try { localStorage.setItem('rita_investigate_chips', JSON.stringify(val)) } catch {}
    setChipsState(val)
  }
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // View toggle — 'activity' | 'shared_hosts'; not persisted, resets on chip/dataset change
  const [chartView, setChartView] = useState('activity')
  useEffect(() => { setChartView('activity') }, [chips, dataset])

  // Shared Hosts is only enabled when exactly one non-negated target chip (IP/CIDR/FQDN) is present
  const targetOnlyChips = chips.filter(c => c.type === 'target' && !c.negate)
  const sharedHostsEnabled = targetOnlyChips.length === 1

  // On pivot arrival: persist chip to localStorage, reset min score, clear nav state
  useEffect(() => {
    if (pivotValue) {
      const pivotChip = { value: pivotValue, negate: false, type: detectChipType(pivotValue) }
      try { localStorage.setItem('rita_investigate_chips', JSON.stringify([pivotChip])) } catch {}
      setMinScore(0)
      window.history.replaceState({}, document.title)
    }
  }, [])

  useEffect(() => {
    if (dataset) { run() }
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
    const targetChips      = chips.filter(c => c.type === 'target'   && !c.negate)
    const notTargetChips   = chips.filter(c => c.type === 'target'   &&  c.negate)
    const scoreChips       = chips.filter(c => c.type === 'score'    && !c.negate)
    const notScoreChips    = chips.filter(c => c.type === 'score'    &&  c.negate)
    const categoryChips    = chips.filter(c => c.type === 'category' && !c.negate)
    const notCategoryChips = chips.filter(c => c.type === 'category' &&  c.negate)
    axios.get('/api/investigate', { ...auth, params: {
      dataset,
      limit: 2000,
      targets:              targetChips.map(c => c.value).join(','),
      not_targets:          notTargetChips.length   ? notTargetChips.map(c => c.value).join(',')   : undefined,
      score_filters:        scoreChips.length        ? scoreChips.map(c => c.value).join(',')       : undefined,
      not_score_filters:    notScoreChips.length     ? notScoreChips.map(c => c.value).join(',')    : undefined,
      category_filters:     categoryChips.length     ? categoryChips.map(c => c.value).join(',')    : undefined,
      not_category_filters: notCategoryChips.length  ? notCategoryChips.map(c => c.value).join(',') : undefined,
      and_mode:             andMode === true ? true : undefined,
      since_hours:          (dateRangeHours && dateRangeHours !== 'custom') ? dateRangeHours : undefined,
      date_from:            dateRangeHours === 'custom' ? customDateFrom || undefined : undefined,
      date_to:              dateRangeHours === 'custom' ? customDateTo   || undefined : undefined,
      min_score:            minScore || undefined,
      max_score:            (maxScore !== null && maxScore < 1) ? maxScore : undefined,
      beacon_type:          beaconType    || undefined,
      threat_intel_only:    threatIntelOnly === true ? true : undefined,
      protocol:             protocol      || undefined,
      show_suppressed:      showSuppressed === true ? true : undefined,
    }})
      .then(r => setData(r.data))
      .catch(() => setError('Investigation failed'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (data !== null) { run() }
  }, [chips, andMode, dateRangeHours, customDateFrom, customDateTo, minScore, maxScore, beaconType, threatIntelOnly, protocol, showSuppressed, dataset])

  const handleApplyRange = (minDay, maxDay) => {
    setDateRangeHours('custom')
    setCustomDateFrom(minDay)
    setCustomDateTo(maxDay)
  }

  const handleCellClick = (value) => {
    if (!value || value === '—') return
    if (!chips.some(c => c.value === value)) {
      setChips([...chips, { value, negate: false, type: 'target' }])
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

  // Shared filter params forwarded to SharedHostsPanel
  const sharedFilters = {
    sinceHours:    (dateRangeHours && dateRangeHours !== 'custom') ? dateRangeHours : undefined,
    dateFrom:      dateRangeHours === 'custom' ? customDateFrom || undefined : undefined,
    dateTo:        dateRangeHours === 'custom' ? customDateTo   || undefined : undefined,
    minScore:      minScore || undefined,
    maxScore:      (maxScore !== null && maxScore < 1) ? maxScore : undefined,
    showSuppressed: showSuppressed === true ? true : undefined,
  }

  const tabBtn = (label, view, enabled = true, disabledTip = '') => {
    const active = chartView === view
    const style = {
      background:  active    ? '#7c85f522' : enabled ? 'none' : 'none',
      border:      `1px solid ${active ? '#7c85f5' : enabled ? '#2d3148' : '#1e2235'}`,
      color:       active    ? '#7c85f5'   : enabled ? '#475569' : '#2d3148',
      borderRadius: 4, padding: '3px 12px',
      cursor:      enabled   ? 'pointer' : 'not-allowed',
      fontSize: 12, fontWeight: active ? 600 : 400,
      transition: 'all 0.15s',
    }
    const btn = (
      <button
        onClick={() => enabled && setChartView(view)}
        style={style}
      >
        {label}
      </button>
    )
    return enabled ? btn : <span key={view} title={disabledTip}>{btn}</span>
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5', marginBottom: '1rem' }}>Investigate</h1>

      <FilterBar />

      <ChipBar chips={chips} setChips={setChips} andMode={andMode} setAndMode={setAndModeP} />

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

          {/* View toggle */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {tabBtn('Activity over time', 'activity')}
            {tabBtn(
              'Shared Hosts',
              'shared_hosts',
              sharedHostsEnabled,
              'Add a single destination IP or FQDN filter to enable this view',
            )}
          </div>

          {chartView === 'activity' && (
            <TrendChart data={data.trend} onApplyRange={handleApplyRange} />
          )}
          {chartView === 'shared_hosts' && sharedHostsEnabled && (
            <SharedHostsPanel
              target={targetOnlyChips[0].value}
              dataset={dataset}
              auth={auth}
              onAddChip={handleCellClick}
              chips={chips}
              setChips={setChips}
              {...sharedFilters}
            />
          )}

          <div style={{ fontSize: 12, color: '#475569', marginBottom: '0.75rem' }}>{data.count} connections found across all threat categories</div>
          <DataTable
            data={data.results}
            columns={columns}
            defaultSort={[{ id: 'beacon_threat_score', desc: true }]}
            onCellClick={handleCellClick}
            hideGlobalFilter
          />
        </>
      )}
    </div>
  )
}
