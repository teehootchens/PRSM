import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { useFilters } from '../FiltersContext'
import DataTable, { ScoreBadge } from '../components/DataTable'
import FilterBar from '../components/FilterBar'
import { formatIP } from '../utils'

export default function Beaconing() {
  const { credentials } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const { dateRangeHours, customDateFrom, customDateTo, minScore, beaconType, threatIntelOnly, protocol, showSuppressed } = useFilters()
  const auth = { auth: credentials }
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (datasets.length) return
    axios.get('/api/datasets', auth)
      .then(r => { setDatasets(r.data.datasets); if (!dataset && r.data.datasets.length > 0) setDataset(r.data.datasets[0]) })
      .catch(() => setError('Could not load datasets'))
  }, [])

  useEffect(() => {
    if (!dataset) return
    setLoading(true); setError(null)
    axios.get('/api/beaconing', { ...auth, params: {
      dataset, limit: 1000,
      min_score: minScore,
      since_hours: (dateRangeHours && dateRangeHours !== 'custom') ? dateRangeHours : undefined,
      date_from: dateRangeHours === 'custom' ? customDateFrom || undefined : undefined,
      date_to: dateRangeHours === 'custom' ? customDateTo || undefined : undefined,
      beacon_type: beaconType || undefined,
      threat_intel_only: threatIntelOnly === true ? true : undefined,
      protocol: protocol || undefined,
      show_suppressed: showSuppressed === true ? true : undefined,
    }})
      .then(r => setData(r.data.results))
      .catch(() => setError('Failed to load beaconing data'))
      .finally(() => setLoading(false))
  }, [dataset, minScore, dateRangeHours, customDateFrom, customDateTo, beaconType, threatIntelOnly, protocol, showSuppressed, refreshKey])

  const columns = useMemo(() => [
    { accessorKey: 'beacon_threat_score', header: 'Threat Score', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'beacon_score', header: 'Beacon', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'src', header: 'Source', cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'dst', header: 'Destination', cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'fqdn', header: 'FQDN', cell: ({ getValue }) => getValue() || <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'threat_intel', header: 'TI Hit', cell: ({ getValue }) => getValue() ? <span style={{ color: '#ef4444', fontWeight: 700 }}>YES</span> : <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'count', header: 'Connections' },
    { accessorKey: 'beacon_type', header: 'Type' },
    { accessorKey: 'last_seen', header: 'Last Seen', cell: ({ getValue }) => new Date(getValue()).toLocaleString() },
  ], [])

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5', marginBottom: '1rem' }}>Beaconing</h1>
      <FilterBar />
      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#7c85f5' }}>Loading...</div>}
      {!loading && <DataTable data={data} columns={columns} onRefresh={() => setRefreshKey(k => k + 1)} defaultSort={[{ id: 'beacon_threat_score', desc: true }]} />}
    </div>
  )
}
