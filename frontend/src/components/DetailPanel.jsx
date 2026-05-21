import { formatIP, formatBytes, formatDuration } from '../utils'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#475569',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: '0.5rem', paddingBottom: '0.3rem',
        borderBottom: '1px solid #2d3148',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, color }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: 13 }}>
      <span style={{ color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
      <span style={{ color: color || '#e2e8f0', textAlign: 'right', wordBreak: 'break-all' }}>
        {String(value)}
      </span>
    </div>
  )
}

function ScoreField({ label, value }) {
  if (value === null || value === undefined) return null
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', fontSize: 13 }}>
      <span style={{ color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 80, height: 4, background: '#1e2235', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
        </div>
        <span style={{ color, fontWeight: 700, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

function IntervalChart({ intervals, counts, label }) {
  if (!intervals || intervals.length === 0) return null
  const max = Math.max(...counts, 1)
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: 11, color: '#475569', marginBottom: '0.4rem' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
        {intervals.slice(0, 20).map((interval, i) => {
          const height = Math.max(4, Math.round((counts[i] / max) * 48))
          const seconds = Math.abs(interval)
          const label = seconds >= 3600 ? `${Math.round(seconds/3600)}h`
            : seconds >= 60 ? `${Math.round(seconds/60)}m`
            : `${seconds}s`
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}
              title={`${label}: ${counts[i]} occurrences`}>
              <div style={{ width: '100%', height, background: '#7c85f5', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DetailPanel({ row, onClose }) {
  if (!row) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 100, cursor: 'pointer',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420, background: '#13161f',
        borderLeft: '1px solid #2d3148',
        zIndex: 101, overflowY: 'auto',
        padding: '1.25rem',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>Connection Detail</div>
            <div style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
              {new Date(row.last_seen).toLocaleString()}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#2d3148', border: 'none', color: '#94a3b8',
              borderRadius: 6, width: 28, height: 28, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Connection */}
        <Section title="Connection">
          <Field label="Source"      value={formatIP(row.src)} color="#93c5fd" />
          <Field label="Destination" value={formatIP(row.dst)} color="#93c5fd" />
          <Field label="FQDN"        value={row.fqdn} color="#a78bfa" />
          <Field label="Type"        value={row.beacon_type} />
          <Field label="Protocol"    value={row.port_proto_service?.join(', ')} />
          <Field label="Connections" value={row.count?.toLocaleString()} />
          <Field label="Total Bytes" value={formatBytes(row.total_bytes)} />
          <Field label="Duration"    value={formatDuration(row.total_duration)} />
          <Field label="Last Seen"   value={new Date(row.last_seen).toLocaleString()} />
          <Field label="Analyzed At" value={row.analyzed_at ? new Date(row.analyzed_at).toLocaleString() : null} />
        </Section>

        {/* Threat Scores */}
        <Section title="Threat Scores">
          <ScoreField label="Threat Score"     value={row.beacon_threat_score} />
          <ScoreField label="Beacon Score"     value={row.beacon_score} />
          <ScoreField label="Timestamp Score"  value={row.ts_score} />
          <ScoreField label="Datasize Score"   value={row.ds_score} />
          <ScoreField label="Duration Score"   value={row.dur_score} />
          <ScoreField label="Histogram Score"  value={row.hist_score} />
          <ScoreField label="Long Conn Score"  value={row.long_conn_score} />
          <ScoreField label="Strobe Score"     value={row.strobe_score} />
          <ScoreField label="C2/DNS Score"     value={row.c2_over_dns_score} />
          <ScoreField label="First Seen Score" value={row.first_seen_score} />
          <ScoreField label="Prevalence Score" value={row.prevalence_score} />
        </Section>

        {/* Threat Intel */}
        {row.threat_intel && (
          <Section title="Threat Intel">
            <Field label="TI Hit"     value="YES" color="#ef4444" />
            <ScoreField label="TI Score" value={row.threat_intel_score} />
            <Field label="Feed"       value={row.modifier_name} />
            <Field label="Indicator"  value={row.modifier_value} />
          </Section>
        )}

        {/* DNS */}
        {(row.c2_over_dns_score > 0 || row.subdomain_count > 0) && (
          <Section title="DNS">
            <ScoreField label="C2/DNS Score"    value={row.c2_over_dns_score} />
            <ScoreField label="Direct Conn"     value={row.c2_over_dns_direct_conn_score} />
            <Field label="Subdomains"           value={row.subdomain_count} />
          </Section>
        )}

        {/* Prevalence */}
        <Section title="Prevalence">
          <Field label="Prevalence"       value={row.prevalence ? `${(row.prevalence * 100).toFixed(1)}%` : null} />
          <Field label="Prevalence Total" value={row.prevalence_total?.toLocaleString()} />
          <Field label="Network Size"     value={row.network_size?.toLocaleString()} />
          <Field label="Missing Host"     value={row.missing_host_count > 0 ? row.missing_host_count : null} color="#f97316" />
        </Section>

        {/* Interval Charts */}
        {row.ts_intervals && row.ts_intervals.length > 0 && (
          <Section title="Beacon Intervals">
            <IntervalChart
              intervals={row.ts_intervals}
              counts={row.ts_interval_counts}
              label="Timestamp interval distribution"
            />
          </Section>
        )}

        {row.ds_sizes && row.ds_sizes.length > 0 && (
          <Section title="Data Size Distribution">
            <IntervalChart
              intervals={row.ds_sizes}
              counts={row.ds_size_counts}
              label="Data size distribution"
            />
          </Section>
        )}
      </div>
    </>
  )
}
