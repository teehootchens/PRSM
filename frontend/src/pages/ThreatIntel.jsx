import { useEffect, useState, useMemo } from 'react'
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, flexRender } from '@tanstack/react-table'
import axios from 'axios'
import { useAuth } from '../AuthContext'

function ScoreBadge({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e'
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
      {pct}%
    </span>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

export default function ThreatIntel() {
  const { credentials } = useAuth()
  const auth = { auth: credentials }
  const [datasets, setDatasets] = useState([])
  const [dataset, setDataset] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sorting, setSorting] = useState([{ id: 'threat_intel_score', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')

  useEffect(() => {
    axios.get('/api/datasets', auth)
      .then(r => { setDatasets(r.data.datasets); if (r.data.datasets.length > 0) setDataset(r.data.datasets[0]) })
      .catch(() => setError('Could not load datasets'))
  }, [])

  useEffect(() => {
    if (!dataset) return
    setLoading(true); setError(null)
    axios.get('/api/threatintel', { ...auth, params: { dataset, limit: 500 } })
      .then(r => setData(r.data.results))
      .catch(() => setError('Failed to load threat intel data'))
      .finally(() => setLoading(false))
  }, [dataset])

  const columns = useMemo(() => [
    { accessorKey: 'threat_intel_score', header: 'TI Score', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'beacon_score', header: 'Beacon', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'src', header: 'Source' },
    { accessorKey: 'dst', header: 'Destination' },
    { accessorKey: 'fqdn', header: 'FQDN', cell: ({ getValue }) => getValue() || <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'modifier_name', header: 'Feed', cell: ({ getValue }) => getValue() || <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'modifier_value', header: 'Indicator', cell: ({ getValue }) => getValue() || <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'total_bytes', header: 'Total Bytes', cell: ({ getValue }) => formatBytes(getValue()) },
    { accessorKey: 'count', header: 'Connections' },
    { accessorKey: 'last_seen', header: 'Last Seen', cell: ({ getValue }) => new Date(getValue()).toLocaleString() },
  ], [])

  const table = useReactTable({
    data, columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>Threat Intel Hits</h1>
        <select value={dataset} onChange={e => setDataset(e.target.value)}
          style={{ background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0', padding: '0.4rem 0.75rem', borderRadius: 6 }}>
          {datasets.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input placeholder="Filter..." value={globalFilter} onChange={e => setGlobalFilter(e.target.value)}
          style={{ background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0', padding: '0.4rem 0.75rem', borderRadius: 6, width: 220 }} />
        {!loading && <span style={{ color: '#475569', marginLeft: 'auto' }}>{table.getRowModel().rows.length} rows</span>}
      </div>
      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#7c85f5' }}>Loading...</div>}
      {!loading && data.length === 0 && !error && (
        <div style={{ color: '#22c55e', padding: '2rem', textAlign: 'center', fontSize: '1.1rem' }}>
          ✓ No threat intel hits found in this dataset
        </div>
      )}
      {!loading && data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(header => (
                    <th key={header.id} onClick={header.column.getToggleSortingHandler()}
                      style={{ padding: '0.6rem 1rem', textAlign: 'left', background: '#1a1d27', borderBottom: '1px solid #2d3148', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted()] ?? ' ↕'}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, i) => (
                <tr key={row.id} style={{ background: i % 2 === 0 ? '#0f1117' : '#13161f' }}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
