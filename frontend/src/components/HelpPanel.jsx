import { useEffect } from 'react'

const SCORE_ROWS = [
  { kw: 'threat',   measure: 'Overall composite threat score',    ex: 'threat>=75' },
  { kw: 'beacon',   measure: 'Connection periodicity / regularity', ex: 'beacon>50' },
  { kw: 'longconn', measure: 'Session duration',                  ex: 'longconn<25' },
  { kw: 'dns',      measure: 'C2-over-DNS / tunneling',           ex: 'dns>0' },
  { kw: 'strobe',   measure: 'High connection count to one host', ex: 'strobe>90' },
  { kw: 'intel',    measure: 'Threat intelligence match',         ex: 'intel>=1' },
]

const BAND_ROWS = [
  { band: 'Critical', threshold: '≥ 75%',  color: '#ef4444' },
  { band: 'High',     threshold: '50–74%', color: '#f97316' },
  { band: 'Medium',   threshold: '25–49%', color: '#eab308' },
  { band: 'Low',      threshold: '1–24%',  color: '#22c55e' },
]

const TH = { padding: '0.3rem 0.5rem', textAlign: 'left', color: '#475569', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #2d3148' }
const TD = { padding: '0.35rem 0.5rem', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid #1e2235' }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#7c85f5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function HelpPanel({ open, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300,
          }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 380,
        background: '#13161f', borderLeft: '1px solid #2d3148',
        overflowY: 'auto', zIndex: 301,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
        padding: '1.5rem',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>Quick Reference</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
          }}>✕</button>
        </div>

        <Section title="Chip Filters">
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#94a3b8', fontSize: 12, lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <li>Type an IP, CIDR, or FQDN → press Enter to add as a filter chip</li>
            <li>Prefix with <code style={{ color: '#ef4444' }}>!</code> or <code style={{ color: '#ef4444' }}>NOT</code> to exclude: <code style={{ color: '#ef4444' }}>!8.8.8.8</code> or <code style={{ color: '#ef4444' }}>NOT 8.8.8.8</code></li>
            <li><strong style={{ color: '#7c85f5' }}>OR</strong> mode: show rows matching <em>any</em> chip</li>
            <li><strong style={{ color: '#eab308' }}>AND</strong> mode: show rows matching <em>all</em> chips</li>
          </ul>
        </Section>

        <Section title="Score Filters">
          <div style={{ color: '#475569', fontSize: 11, marginBottom: '0.5rem' }}>
            Syntax: <code style={{ color: '#eab308' }}>keyword&gt;value</code> where value is 0–100
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Keyword</th>
                <th style={TH}>Measures</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_ROWS.map(r => (
                <tr key={r.kw}>
                  <td style={{ ...TD, fontFamily: 'monospace', color: '#eab308' }}>{r.kw}</td>
                  <td style={TD}>{r.measure}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#475569', marginTop: '0.4rem' }}>
            Operators: <code style={{ color: '#94a3b8' }}>&gt; &lt; &gt;= &lt;= =</code>
            &nbsp;&nbsp;Example: <code style={{ color: '#eab308' }}>beacon&gt;75</code>
          </div>
        </Section>

        <Section title="Severity Bands">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Band</th>
                <th style={TH}>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {BAND_ROWS.map(r => (
                <tr key={r.band}>
                  <td style={{ ...TD, fontWeight: 600, color: r.color }}>{r.band}</td>
                  <td style={TD}>{r.threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Interactions">
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#94a3b8', fontSize: 12, lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <li><strong style={{ color: '#e2e8f0' }}>Left-click</strong> src/dst/FQDN — add as local chip filter</li>
            <li><strong style={{ color: '#e2e8f0' }}>Right-click</strong> src/dst/FQDN — suppress, global filter, pivot to Investigate</li>
            <li><strong style={{ color: '#e2e8f0' }}>Click row</strong> (elsewhere) — open Connection Details panel</li>
            <li><strong style={{ color: '#e2e8f0' }}>Click PRSM logo</strong> — return to Master Dashboard</li>
          </ul>
        </Section>
      </div>
    </>
  )
}
