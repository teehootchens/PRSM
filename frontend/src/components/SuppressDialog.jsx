import { useState } from 'react'
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

export default function SuppressDialog({ row, valueType, onClose, onSuccess }) {
  const { credentials } = useAuth()
  const { dataset } = useDataset()

  const rawValue = valueType === 'src' ? row.src
    : valueType === 'dst' ? row.dst
    : row.fqdn
  const displayValue = valueType === 'fqdn' ? rawValue : formatIP(rawValue)

  const [scope, setScope] = useState('global')
  const [expiresDays, setExpiresDays] = useState(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(credentials.username + ':' + credentials.password),
        },
        body: JSON.stringify({
          value: displayValue,
          value_type: valueType,
          scope: scope === 'dataset' ? dataset : 'global',
          reason: reason || null,
          expires_days: expiresDays,
        }),
      })
      if (res.status === 200) {
        onSuccess(displayValue)
        onClose()
      } else if (res.status === 409) {
        setError('Already suppressed in this scope')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || `Error ${res.status}`)
      }
    } catch (e) {
      setError('Failed to suppress')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
      />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#1a1d27', border: '1px solid #2d3148',
        borderRadius: 12, padding: '1.5rem', zIndex: 201, width: 420,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: '0.25rem' }}>Suppress Entry</div>
        <div style={{ fontSize: 12, color: '#475569', marginBottom: '1.25rem' }}>This entry will be hidden from all views</div>

        <div style={{ background: '#0f1117', border: '1px solid #2d3148', borderRadius: 6, padding: '0.6rem 0.75rem', marginBottom: '1rem', fontSize: 13 }}>
          <span style={{ color: '#475569', marginRight: 8 }}>
            {valueType === 'src' ? 'Source IP' : valueType === 'dst' ? 'Destination IP' : 'FQDN'}:
          </span>
          <span style={{ color: '#93c5fd', fontWeight: 600 }}>{displayValue}</span>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Scope</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[{ value: 'global', label: 'Global', desc: 'All datasets' }, { value: 'dataset', label: 'This dataset', desc: dataset }].map(s => (
              <div key={s.value} onClick={() => setScope(s.value)} style={{
                flex: 1, padding: '0.6rem 0.75rem',
                background: scope === s.value ? '#7c85f522' : '#0f1117',
                border: `1px solid ${scope === s.value ? '#7c85f5' : '#2d3148'}`,
                borderRadius: 6, cursor: 'pointer',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: scope === s.value ? '#7c85f5' : '#e2e8f0' }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Expires</label>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {EXPIRY_OPTIONS.map(o => (
              <button key={o.label} onClick={() => setExpiresDays(o.days)} style={{
                background: expiresDays === o.days ? '#7c85f522' : '#0f1117',
                border: `1px solid ${expiresDays === o.days ? '#7c85f5' : '#2d3148'}`,
                color: expiresDays === o.days ? '#7c85f5' : '#94a3b8',
                borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                fontWeight: expiresDays === o.days ? 600 : 400,
              }}>{o.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Reason (optional)</label>
          <input type="text" placeholder="e.g. WSUS server, confirmed benign..."
            value={reason} onChange={e => setReason(e.target.value)}
            style={{ width: '100%', background: '#0f1117', border: '1px solid #2d3148', color: '#e2e8f0', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: '0.75rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #2d3148', color: '#475569', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} style={{ background: '#7c85f5', border: 'none', color: '#fff', borderRadius: 6, padding: '0.5rem 1rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Suppressing...' : 'Suppress'}
          </button>
        </div>
      </div>
    </>
  )
}
