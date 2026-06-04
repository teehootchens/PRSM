import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { useFilters } from '../FiltersContext'
import DataTable, { ScoreBadge } from '../components/DataTable'
import FilterBar from '../components/FilterBar'
import ChipBar from '../components/ChipBar'
import { usePageChips } from '../hooks/usePageChips'
import { formatIP, formatBytes, formatDuration, applyChips } from '../utils'

export default function LongConns() {
  const { authHeader } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const { dateRangeHours, customDateFrom, customDateTo, minScore, maxScore, beaconType, threatIntelOnly, protocol, showSuppressed } = useFilters()
  const auth = { headers: authHeader }
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { chips, setChips, addChip, andMode, setAndMode } = usePageChips('longconns_chips')

  useEffect(() => {
    if (datasets.length) return
    axios.get('/api/datasets', auth)
      .then(r => { setDatasets(r.data.datasets); if (!dataset && r.data.datasets.length > 0) setDataset(r.data.datasets[0]) })
      .catch(() => setError('Could not load datasets'))
  }, [])

  useEffect(() => {
    if (!dataset) return
    setLoading(true); setError(null)
    axios.get('/api/longconns', { ...auth, params: {
      dataset, limit: 1000,
      min_score: minScore,
      max_score: maxScore < 1 ? maxScore : undefined,
      since_hours: (dateRangeHours && dateRangeHours !== 'custom') ? dateRangeHours : undefined,
      date_from: dateRangeHours === 'custom' ? customDateFrom || undefined : undefined,
      date_to: dateRangeHours === 'custom' ? customDateTo || undefined : undefined,
      beacon_type: beaconType || undefined,
      threat_intel_only: threatIntelOnly === true ? true : undefined,
      protocol: protocol || undefined,
      show_suppressed: showSuppressed === true ? true : undefined,
    }})
      .then(r => setData(r.data.results))
      .catch(() => setError('Failed to load long connections'))
      .finally(() => setLoading(false))
  }, [dataset, minScore, maxScore, dateRangeHours, customDateFrom, customDateTo, beaconType, threatIntelOnly, protocol, showSuppressed, refreshKey])

  const filteredData = useMemo(() => applyChips(data, chips, andMode), [data, chips, andMode])

  const columns = useMemo(() => [
    { accessorKey: 'long_conn_score', header: 'Score', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'src', header: 'Source', cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'dst', header: 'Destination', cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'fqdn', header: 'FQDN', cell: ({ getValue }) => getValue() || <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'total_duration', header: 'Duration', cell: ({ getValue }) => formatDuration(getValue()) },
    { accessorKey: 'total_bytes', header: 'Total Bytes', cell: ({ getValue }) => formatBytes(getValue()) },
    { accessorKey: 'count', header: 'Connections' },
    { accessorKey: 'threat_intel', header: 'TI Hit', cell: ({ getValue }) => getValue() ? <span style={{ color: '#ef4444', fontWeight: 700 }}>YES</span> : <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'last_seen', header: 'Last Seen', cell: ({ getValue }) => new Date(getValue()).toLocaleString() },
  ], [])

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5', marginBottom: '1rem' }}>Long Connections</h1>
      <FilterBar />
      <ChipBar chips={chips} setChips={setChips} andMode={andMode} setAndMode={setAndMode} />
      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#7c85f5' }}>Loading...</div>}
      {!loading && data.length === 0 && !error && (
        <div style={{ color: '#475569', padding: '2rem', textAlign: 'center' }}>No data available for this dataset.</div>
      )}
      {!loading && data.length > 0 && <DataTable data={filteredData} columns={columns} onRefresh={() => setRefreshKey(k => k + 1)} defaultSort={[{ id: 'long_conn_score', desc: true }]} onCellClick={addChip} />}
    </div>
  )
}
