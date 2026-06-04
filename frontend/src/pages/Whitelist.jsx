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

function ConfirmDialog({ count, onConfirm, onCancel }) {
  const [input, setInput] = useState('')
  const word = 'delete'
  const valid = input.toLowerCase() === word

  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#1a1d27', border: '1px solid #ef444466',
        borderRadius: 12, padding: '1.5rem', zIndex: 201, width: 380,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', marginBottom: '0.5rem' }}>
          Delete {count} suppression{count > 1 ? 's' : ''}?
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: '1.25rem' }}>
          This cannot be undone. Type <strong style={{ color: '#e2e8f0' }}>{word}</strong> to confirm.
        </div>
        <input
          autoFocus
          type="text"
          placeholder={`Type "${word}" to confirm`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && valid && onConfirm()}
          style={{
            width: '100%', background: '#0f1117',
            border: `1px solid ${valid ? '#22c55e' : '#2d3148'}`,
            color: '#e2e8f0', padding: '0.5rem 0.75rem',
            borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
            marginBottom: '1rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            background: 'none', border: '1px solid #2d3148', color: '#475569',
            borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: 13,
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={!valid} style={{
            background: valid ? '#ef4444' : '#2d3148',
            border: 'none', color: valid ? '#fff' : '#475569',
            borderRadius: 6, padding: '0.5rem 1rem',
            cursor: valid ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600,
            transition: 'all 0.15s',
          }}>Delete {count} entr{count > 1 ? 'ies' : 'y'}</button>
        </div>
      </div>
    </>
  )
}

function AddForm({ onAdded, dataset }) {
  const { authHeader } = useAuth()
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
          ...authHeader,
        },
        body: JSON.stringify({
          value: value.trim(), value_type: valueType,
          scope: scope === 'dataset' ? dataset : 'global',
          reason: reason || null, expires_days: expiresDays,
        }),
      })
      if (res.ok) { setValue(''); setReason(''); onAdded() }
      else if (res.status === 409) setError('Already suppressed')
      else { const d = await res.json().catch(() => ({})); setError(d.detail || `Error ${res.status}`) }
    } catch { setError('Failed to add') }
    finally { setLoading(false) }
  }

  const selectStyle = { background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0', padding: '0.4rem 0.6rem', borderRadius: 6, fontSize: 13 }

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Add Suppression</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input placeholder="IP, CIDR (10.0.0.0/24), or FQDN" value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ ...selectStyle, width: 220 }} />
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
          {EXPIRY_OPTIONS.map(o => <option key={o.label} value={o.days ?? ''}>{o.label}</option>)}
        </select>
        <input placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)}
          style={{ ...selectStyle, width: 200 }} />
        <button onClick={handleAdd} disabled={loading || !value.trim()} style={{
          background: '#7c85f5', border: 'none', color: '#fff', borderRadius: 6,
          padding: '0.4rem 1rem', cursor: loading || !value.trim() ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 600, opacity: loading || !value.trim() ? 0.6 : 1,
        }}>Add</button>
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: '0.5rem' }}>{error}</div>}
    </div>
  )
}

function ImportForm({ onImported, dataset }) {
  const { authHeader } = useAuth()
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
        { headers: { ...authHeader, 'Content-Type': 'multipart/form-data' } }
      )
      setResult(res.data); onImported()
    } catch (e) { setError(e.response?.data?.detail || 'Import failed') }
    finally { setLoading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const selectStyle = { background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0', padding: '0.4rem 0.6rem', borderRadius: 6, fontSize: 13 }

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Import from Excel</div>
      <div style={{ color: '#475569', fontSize: 12, marginBottom: '0.75rem' }}>Single column, no header — each row is an IP or FQDN. IPs added as both src and dst.</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={scope} onChange={e => setScope(e.target.value)} style={selectStyle}>
          <option value="global">Global</option>
          <option value="dataset">This dataset ({dataset})</option>
        </select>
        <select value={expiresDays ?? ''} onChange={e => setExpiresDays(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
          {EXPIRY_OPTIONS.map(o => <option key={o.label} value={o.days ?? ''}>{o.label}</option>)}
        </select>
        <label style={{ background: '#2d3148', border: '1px solid #475569', color: '#e2e8f0', borderRadius: 6, padding: '0.4rem 1rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
          {loading ? 'Importing...' : 'Choose Excel File'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={loading} style={{ display: 'none' }} />
        </label>
      </div>
      {result && <div style={{ marginTop: '0.5rem', fontSize: 12, color: '#22c55e' }}>✓ Added {result.added} — {result.skipped} skipped — {result.invalid} invalid</div>}
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: '0.5rem' }}>{error}</div>}
    </div>
  )
}

export default function Whitelist() {
  const { authHeader } = useAuth()
  const { dataset } = useDataset()
  const [suppressions, setSuppressions] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const load = () => {
    setLoading(true)
    axios.get('/api/whitelist', { headers: authHeader })
      .then(r => setSuppressions(r.data.suppressions))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    setDeleteError(null)
    try {
      await axios.delete(`/api/whitelist/${id}`, { headers: authHeader })
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e) {
      setDeleteError(e.response?.data?.detail || 'Failed to delete — try again')
    } finally {
      load()
    }
  }

  const handleBulkDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await Promise.all([...selected].map(id => axios.delete(`/api/whitelist/${id}`, { headers: authHeader })))
      setSelected(new Set())
      setConfirmDialog(false)
    } catch (e) {
      setDeleteError(e.response?.data?.detail || 'Failed to delete one or more entries — try again')
    } finally {
      setDeleting(false)
      load()
    }
  }

  const TYPE_DISPLAY = { src: 'source ip', dst: 'dest ip', fqdn: 'fqdn' }

  const rawFiltered = suppressions.filter(s => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      s.value_type.toLowerCase().includes(q) ||
      (TYPE_DISPLAY[s.value_type] || '').includes(q) ||
      s.value.toLowerCase().includes(q) ||
      s.scope.toLowerCase().includes(q) ||
      (s.reason || '').toLowerCase().includes(q)
    )
  })

  // Group by value+scope so same IP shows as one row with multiple type badges
  const groupMap = {}
  for (const s of rawFiltered) {
    const key = `${s.value}||${s.scope}`
    if (!groupMap[key]) {
      groupMap[key] = { ...s, ids: [s.id], types: [s.value_type] }
    } else {
      groupMap[key].ids.push(s.id)
      groupMap[key].types.push(s.value_type)
    }
  }
  const filtered = Object.values(groupMap)

  const allSelected = filtered.length > 0 && filtered.every(g => g.ids.every(id => selected.has(id)))
  const someSelected = filtered.some(g => g.ids.some(id => selected.has(id)))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(g => g.ids.forEach(id => n.delete(id))); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(g => g.ids.forEach(id => n.add(id))); return n })
    }
  }

  const toggleOne = (ids) => {
    setSelected(prev => {
      const n = new Set(prev)
      const allChecked = ids.every(id => n.has(id))
      ids.forEach(id => allChecked ? n.delete(id) : n.add(id))
      return n
    })
  }

  const selectedCount = filtered.filter(g => g.ids.every(id => selected.has(id))).length

  const typeLabel = t => t === 'src' ? 'Source IP' : t === 'dst' ? 'Dest IP' : 'FQDN'
  const typeColor = t => t === 'src' ? '#38bdf8' : t === 'dst' ? '#a78bfa' : '#eab308'

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c85f5', marginBottom: '1.5rem' }}>Suppression List</h1>

      <AddForm onAdded={load} dataset={dataset} />
      <ImportForm onImported={load} dataset={dataset} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          placeholder="Search suppressions..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0', padding: '0.4rem 0.75rem', borderRadius: 6, width: 260, fontSize: 13 }}
        />

        {selectedCount > 0 && (
          <button
            onClick={() => setConfirmDialog(true)}
            style={{
              background: '#ef444422', border: '1px solid #ef4444',
              color: '#ef4444', borderRadius: 6, padding: '0.4rem 1rem',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            Delete {selectedCount} selected
          </button>
        )}

        <span style={{ color: '#475569', fontSize: 13, marginLeft: 'auto' }}>
          {selectedCount > 0 ? `${selectedCount} of ${filtered.length} selected` : `${filtered.length} entries`}
        </span>
      </div>

      {deleteError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: '0.75rem' }}>{deleteError}</div>}
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
                <th style={{ padding: '0.6rem 1rem', background: '#1a1d27', borderBottom: '1px solid #2d3148', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer', accentColor: '#7c85f5' }}
                  />
                </th>
                {['Type', 'Value', 'Scope', 'Reason', 'Expires', 'Added', ''].map(h => (
                  <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', background: '#1a1d27', borderBottom: '1px solid #2d3148', color: '#94a3b8', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((g, i) => (
                <tr key={g.ids.join('-')} style={{ background: g.ids.every(id => selected.has(id)) ? '#1e2235' : i % 2 === 0 ? '#0f1117' : '#13161f' }}>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={g.ids.every(id => selected.has(id))}
                      ref={el => { if (el) el.indeterminate = g.ids.some(id => selected.has(id)) && !g.ids.every(id => selected.has(id)) }}
                      onChange={() => toggleOne(g.ids)}
                      style={{ cursor: 'pointer', accentColor: '#7c85f5' }}
                    />
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {g.types.map((t, ti) => (
                        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: typeColor(t) + '22', color: typeColor(t), border: `1px solid ${typeColor(t)}55`, borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                          {typeLabel(t)}
                          <button
                            onClick={() => handleDelete(g.ids[ti])}
                            title={`Remove ${typeLabel(t)} only`}
                            style={{ background: 'none', border: 'none', color: typeColor(t), cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, opacity: 0.7 }}
                          >✕</button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13 }}>{g.value}</td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235' }}>
                    <span style={{ background: g.scope === 'global' ? '#7c85f522' : '#38bdf822', color: g.scope === 'global' ? '#7c85f5' : '#38bdf8', border: `1px solid ${g.scope === 'global' ? '#7c85f5' : '#38bdf8'}55`, borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                      {g.scope === 'global' ? 'Global' : g.scope}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#64748b', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.reason || '—'}</td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#94a3b8', fontSize: 13, whiteSpace: 'nowrap' }}>{g.expires_at ? new Date(g.expires_at).toLocaleDateString() : 'Permanent'}</td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235', color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2235' }}>
                    <button onClick={() => Promise.all(g.ids.map(id => handleDelete(id)))} style={{ background: '#ef444422', border: '1px solid #ef444455', color: '#ef4444', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {g.types.length > 1 ? 'Remove All' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          count={selectedCount}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmDialog(false)}
        />
      )}
    </div>
  )
}
