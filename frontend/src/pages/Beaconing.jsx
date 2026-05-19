import { useEffect, useState, useMemo } from 'react'
import { flexRender } from '@tanstack/react-table'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import DataTable, { ScoreBadge } from '../components/DataTable'
import { formatIP } from '../utils'

export default function Beaconing() {
  const { credentials } = useAuth()
  const { datasets, setDatasets, dataset, setDataset } = useDataset()
  const auth = { auth: credentials }
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (datasets.length) return
    axios.get('/api/datasets', auth)
      .then(r => {
        setDatasets(r.data.datasets)
        if (!dataset && r.data.datasets.length > 0) setDataset(r.data.datasets[0])
      })
      .catch(() => setError('Could not load datasets'))
  }, [])

  useEffect(() => {
    if (!dataset) return
    setLoading(true); setError(null)
    axios.get('/api/beaconing', { ...auth, params: { dataset, limit: 1000 } })
      .then(r => setData(r.data.results))
      .catch(() => setError('Failed to load beaconing data'))
      .finally(() => setLoading(false))
  }, [dataset])

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5' }}>Beaconing</h1>
      </div>
      {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#7c85f5' }}>Loading...</div>}
      {!loading && <DataTable data={data} columns={columns} defaultSort={[{ id: 'beacon_threat_score', desc: true }]} />}
    </div>
  )
}
