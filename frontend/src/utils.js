export function formatIP(ip) {
  if (!ip) return '—'
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

export function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

export function formatDuration(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Parse CIDR notation — returns {network, mask} or null
export function parseCIDR(cidr) {
  const match = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/)
  if (!match) return null
  const parts = match[1].split('.').map(Number)
  if (parts.some(p => p < 0 || p > 255)) return null
  const prefix = parseInt(match[2])
  if (prefix < 0 || prefix > 32) return null
  const network = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0
  return { network: network & mask, mask }
}

// Check if an IP string is within a CIDR range
export function ipInCIDR(ip, cidr) {
  const parsed = parseCIDR(cidr)
  if (!parsed) return false
  const parts = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!parts) return false
  const ipNum = (parseInt(parts[1]) << 24 | parseInt(parts[2]) << 16 | parseInt(parts[3]) << 8 | parseInt(parts[4])) >>> 0
  return (ipNum & parsed.mask) === parsed.network
}

// ── Client-side chip filtering ───────────────────────────────────────────────
const _SCORE_COL = {
  threat: 'beacon_threat_score', beacon: 'beacon_score',
  longconn: 'long_conn_score',   dns: 'c2_over_dns_score',
  strobe: 'strobe_score',        intel: 'threat_intel_score',
}
const _SCORE_RE = /^(threat|beacon|longconn|dns|strobe|intel)(>=|<=|>|<|=)(\d{1,3})$/i
const _CAT_MATCH = {
  beacon:   r => (r.beacon_score || 0) > 0,
  intel:    r => r.threat_intel === true,
  longconn: r => (r.long_conn_score || 0) > 0,
  dns:      r => (r.c2_over_dns_score || 0) > 0,
  strobe:   r => (r.strobe_score || 0) > 0,
  threat:   r => (r.beacon_threat_score || 0) > 0,
}

export function matchesChip(row, chip) {
  if (chip.type === 'score') {
    const m = chip.value.match(_SCORE_RE)
    if (!m) return false
    const col = _SCORE_COL[m[1].toLowerCase()]
    const op = m[2], val = parseInt(m[3], 10)
    const rv = Math.round((row[col] || 0) * 100)
    if (op === '>')  return rv >  val
    if (op === '<')  return rv <  val
    if (op === '>=') return rv >= val
    if (op === '<=') return rv <= val
    if (op === '=')  return rv === val
    return false
  }
  if (chip.type === 'category') {
    const fn = _CAT_MATCH[chip.value]
    return fn ? fn(row) : false
  }
  // IP / FQDN target
  const src  = formatIP(row.src  || '')
  const dst  = formatIP(row.dst  || '')
  const fqdn = row.fqdn || ''
  const v = chip.value
  if (v.includes('/')) return ipInCIDR(src, v) || ipInCIDR(dst, v)
  if (v.includes('*')) return matchesFilter(src, v) || matchesFilter(dst, v) || matchesFilter(fqdn, v)
  return src === v || dst === v || fqdn.toLowerCase().includes(v.toLowerCase())
}

export function applyChips(rows, chips, andMode) {
  if (!chips || chips.length === 0) return rows
  const pos = chips.filter(c => !c.negate)
  const neg = chips.filter(c =>  c.negate)
  return rows.filter(row => {
    if (neg.some(c => matchesChip(row, c))) return false
    if (pos.length === 0) return true
    return andMode ? pos.every(c => matchesChip(row, c)) : pos.some(c => matchesChip(row, c))
  })
}

// Returns true if filter matches the value (supports CIDR)
export function matchesFilter(value, filter) {
  if (!filter || !value) return false
  // Try CIDR match
  if (filter.includes('/')) {
    return ipInCIDR(value, filter)
  }
  // Wildcard match e.g. 10.0.0.*
  if (filter.includes('*')) {
    const pattern = filter.replace(/\./g, '\\.').replace(/\*/g, '.*')
    return new RegExp(`^${pattern}$`).test(value)
  }
  // Plain text match
  return value.toLowerCase().includes(filter.toLowerCase())
}
