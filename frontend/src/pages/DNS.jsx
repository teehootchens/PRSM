import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { useFilters } from '../FiltersContext'
import DataTable, { ScoreBadge } from '../components/DataTable'
import FilterBar from '../components/FilterBar'
import { formatIP } from '../utils'

export default function DNS() {
  const { credentials } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const { dateRangeHours, customDateFrom, customDateTo, minScore, beaconType, threatIntelOnly, protocol } = useFilters()
  const auth = { auth: credentials }
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (datasets.length) return
    axios.get('/api/datasets', auth)
      .then(r => { setDatasets(r.data.datasets); if (!dataset && r.data.datasets.length > 0) setDataset(r.data.datasets[0]) })
      .catch(() => setError('Could not load datasets'))
  }, [])

  useEffect(() => {
    if (!dataset) return
    setLoading(true); setError(null)
    axios.get('/api/dns', { ...auth, params: {
      dataset, limit: 1000,
      min_score: minScore,
      since_hours: (dateRangeHours && dateRangeHours !== 'custom') ? dateRangeHours : undefined,
      date_from: dateRangeHours === 'custom' ? customDateFrom || undefined : undefined,
      date_to: dateRangeHours === 'custom' ? customDateTo || undefined : undefined,
      beacon_type: beaconType || undefined,
      threat_intel_only: threatIntelOnly || undefined,
      protocol: protocol || undefined,
    }})
      .then(r => setData(r.data.results))
      .catch(() => setError('Failed to load DNS data'))
      .finally(() => setLoading(false))
  }, [dataset, minScore, dateRangeHours, customDateFrom, customDateTo, beaconType, threatIntelOnly, protocol])

  const columns = useMemo(() => [
    { accessorKey: 'c2_over_dns_score', header: 'C2/DNS Score', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'c2_over_dns_direct_conn_score', header: 'Direct Conn', cell: ({ getValue }) => <ScoreBadge value={getValue()} /> },
    { accessorKey: 'src', header: 'Source', cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'dst', header: 'Destination', cell: ({ getValue }) => formatIP(getValue()) },
    { accessorKey: 'fqdn', header: 'FQDN', cell: ({ getValue }) => getValue() || <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'subdomain_count', header: 'Subdomains' },
    { accessorKey: 'count', header: 'Queries' },
    { accessorKey: 'threat_intel', header: 'TI Hit', cell: ({ getValue }) => getValue() ? <span style={{ color: '#ef4444', fontWeight: 700 }}>YES</span> : <span style={{ color: '#475569' }}>—</span> },
    { accessorKey: 'last_seen', header: 'Last Seen', cell: ({ getValue }) => new Date(getValue()).toLocaleString() },
  ], [])

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5', marginBottom: '1rem' }}>DNS Analysis</h1>
      <FilterBar />
      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#7c85f5' }}>Loading...</div>}
      {!loading && <DataTable data={data} columns={columns} defaultSort={[{ id: 'c2_over_dns_score', desc: true }]} />}
    </div>
  )
}
