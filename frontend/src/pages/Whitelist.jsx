import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useDataset } from '../DatasetContext'
import { formatIP } from '../utils'

const EXPIRY_OPTIONS = [
  { label: '30 days',   days: 30 },
  { label: '60 days',   days: 60 },
  { label: '90 days',   days: 90 },
  { label: '180 days',  days: 180 },
  { label: '1 year',    days: 365 },
  { label: 'Permanent', days: null },
]

function AddForm({ onAdded, credentials, dataset }) {
  const [value, setValue] = useState('')
  const [valueType, setValueType] = useState('src')
  const [scope, setScope] = useState('global')
  const [expiresDays, setExpiresDays] = useState(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleAdd = async () => {
    if (!value.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(credentials.username + ':' + credentials.password),
        },
        body: JSON.stringify({
          value: value.trim(),
          value_type: valueType,
          scope: scope === 'dataset' ? dataset : 'global',
          reason: reason || null,
          expires_days: expiresDays,
        }),
      })
      if (res.ok) {
        setValue(''); setReason('')
        onAdded()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || `Error ${res.status}`)
      }
    } catch (e) {
      setError('Failed to add')
    } finally {
      setLoading(false)
    }
  }

  const selectStyle = {
    background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0',
    padding: '0.4rem 0.6rem', borderRadius: 6, fontSize: 13,
  }

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
        Add Suppression
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input
          placeholder="IP address or FQDN"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ ...selectStyle, width: 220 }}
        />
        <select value={valueType} onChange={e => setValueType(e.target.value)} style={selectStyle}>
          <option value="src">Source IP</option>
          <option value="dst">Destination IP</option>
          <option value="fqdn">FQDN</option>
        </select>
        <select value={scope} onChange={e => setScope(e.target.value)} style={selectStyle}>
          <option value="global">Global</option>
          <option value="dataset">This dataset ({dataset})</option>
        </select>
        <select value={expiresDays ?? ''} onChange={e => setExpiresDays(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
          {EXPIRY_OPTIONS.map(o => (
            <option key={o.label} value={o.days ?? ''}>{o.label}</option>
          ))}
        </select>
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={{ ...selectStyle, width: 200 }}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !value.trim()}
          style={{
            background: '#7c85f5', border: 'none', color: '#fff',
            borderRadius: 6, padding: '0.4rem 1rem',
            cursor: loading || !value.trim() ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600,
            opacity: loading || !value.trim() ? 0.6 : 1,
          }}
        >
          Add
        </button>
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: '0.5rem' }}>{error}</div>}
    </div>
  )
}

function ImportForm({ onImported, credentials, dataset }) {
  const fileRef = useRef(null)
  const [scope, setScope] = useState('global')
  const [expiresDays, setExpiresDays] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true); setError(null); setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await axios.post(
        `/api/whitelist/import?scope=${scope === 'dataset' ? dataset : 'global'}${expiresDays ? `&expires_days=${expiresDays}` : ''}`,
        formData,
        { auth: credentials, headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setResult(res.data)
      onImported()
    } catch (e) {
      setError(e.response?.data?.detail || 'Import failed')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const selectStyle = {
    background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0',
    padding: '0.4rem 0.6rem', borderRadius: 6, fontSize: 13,
  }

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
        Import from Excel
      </div>
      <div style={{ color: '#475569', fontSize: 12, marginBottom: '0.75rem' }}>
        Single column, no header — each row is an IP address or FQDN. IPs are added as both src and dst.
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={scope} onChange={e => setScope(e.target.value)} style={selectStyle}>
          <option value="global">Global</option>
          <option value="dataset">This dataset ({dataset})</option>
        </select>
        <select value={expiresDays ?? ''} onChange={e => setExpiresDays(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
          {EXPIRY_OPTIONS.map(o => (
            <option key={o.label} value={o.days ?? ''}>{o.label}</option>
          ))}
        </select>
        <label style={{
          background: '#2d3148', border: '1px solid #475569', color: '#e2e8f0',
          borderRadius: 6, padding: '0.4rem 1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 600,
        }}>
          {loading ? 'Importing...' : 'Choose Excel File'}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImport}
            disabled={loading}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      {result && (
        <div style={{ marginTop: '0.5rem', fontSize: 12, color: '#22c55e' }}>
          ✓ Added {result.added} entries — {result.skipped} skipped (already suppressed), {result.invalid} invalid
        </div>
      )}
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: '0.5rem' }}>{error}</div>}
    </div>
  )
}

export default function Whitelist() {
  const { credentials } = useAuth()
  const { dataset } = useDataset()
  const [suppressions, setSuppressions] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  const load = () => {
    setLoading(true)
    axios.get('/api/whitelist', { auth: credentials })
      .then(r => setSuppressions(r.data.suppressions))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    await axios.delete(`/api/whitelist/${id}`, { auth: credentials })
    load()
  }

  const filtered = suppressions.filter(s =>
    s.value.includes(filter) ||
    s.scope.includes(filter) ||
    (s.reason || '').toLowerCase().includes(filter.toLowerCase())
  )

  const typeLabel = t => t === 'src' ? 'Source IP' : t === 'dst' ? 'Dest IP' : 'FQDN'
  const typeColor = t => t === 'src' ? '#38bdf8' : t === 'dst' ? '#a78bfa' : '#eab308'

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5', marginBottom: '1.5rem' }}>
        Suppression List
      </h1>

      <AddForm onAdded={load} credentials={credentials} dataset={dataset} />
      <ImportForm onImported={load} credentials={credentials} dataset={dataset} />

      {/* Filter + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          placeholder="Search suppressions..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0',
            padding: '0.4rem 0.75rem', borderRadius: 6, width: 260, fontSize: 13,
          }}
        />
        <span style={{ color: '#475569', fontSize: 13, marginLeft: 'auto' }}>
          {filtered.length} entries
        </span>
      </div>

      {loading && <div style={{ color: '#7c85f5' }}>Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ color: '#475569', padding: '2rem', textAlign: 'center' }}>
          No suppressions yet — right-click any row to suppress an entry
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Type', 'Value', 'Scope', 'Reason', 'Expires', 'Added', ''].map(h => (
                  <th key={h} style={{
                    padding: '0.6rem 1rem', textAlign: 'left',
                    background: '#1a1d27', borderBottom: '1px solid #2d3148',
                    color: '#94a3b8', fontWeight: 600, fontSize: 12,
                    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#0f1117' : '#13161f' }}>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235' }}>
                    <span style={{
                      background: typeColor(s.value_type) + '22',
                      color: typeColor(s.value_type),
                      border: `1px solid ${typeColor(s.value_type)}55`,
                      borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600,
                    }}>
                      {typeLabel(s.value_type)}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13 }}>
                    {s.value}
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235' }}>
                    <span style={{
                      background: s.scope === 'global' ? '#7c85f522' : '#38bdf822',
                      color: s.scope === 'global' ? '#7c85f5' : '#38bdf8',
                      border: `1px solid ${s.scope === 'global' ? '#7c85f5' : '#38bdf8'}55`,
                      borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600,
                    }}>
                      {s.scope === 'global' ? 'Global' : s.scope}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#64748b', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.reason || '—'}
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#94a3b8', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : 'Permanent'}
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235' }}>
                    <button
                      onClick={() => handleDelete(s.id)}
                      style={{
                        background: '#ef444422', border: '1px solid #ef444455',
                        color: '#ef4444', borderRadius: 4, padding: '2px 10px',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
