import { useState, useRef } from 'react'

function InfoTooltip() {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ color: '#475569', cursor: 'default', fontSize: 14, userSelect: 'none', lineHeight: 1 }}
      >ⓘ</span>
      {show && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 200,
          background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8,
          padding: '0.75rem 1rem', width: 320, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          fontSize: 12, color: '#94a3b8', lineHeight: 1.65,
        }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>Filter syntax</div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <li>Type an IP, CIDR (<code style={{ color: '#7c85f5' }}>10.0.0.0/24</code>), or FQDN and press Enter</li>
            <li>Prefix with <code style={{ color: '#ef4444' }}>!</code> or <code style={{ color: '#ef4444' }}>NOT</code> to exclude: <code style={{ color: '#ef4444' }}>!8.8.8.8</code></li>
            <li>Score filters: <code style={{ color: '#eab308' }}>beacon&gt;50</code> · <code style={{ color: '#eab308' }}>threat&gt;=75</code> · <code style={{ color: '#eab308' }}>dns&lt;25</code></li>
            <li>Operators: <code style={{ color: '#94a3b8' }}>&gt; &lt; &gt;= &lt;= =</code></li>
            <li>Keywords: <code style={{ color: '#7c85f5' }}>beacon</code> · <code style={{ color: '#94a3b8' }}>threat</code> · <code style={{ color: '#38bdf8' }}>longconn</code> · <code style={{ color: '#a78bfa' }}>dns</code> · <code style={{ color: '#f97316' }}>strobe</code> · <code style={{ color: '#f87171' }}>intel</code></li>
            <li>Category shortcuts: type <code style={{ color: '#7c85f5' }}>beacon</code>, <code style={{ color: '#94a3b8' }}>threat</code>, <code style={{ color: '#38bdf8' }}>longconn</code>, <code style={{ color: '#a78bfa' }}>dns</code>, <code style={{ color: '#f97316' }}>strobe</code>, or <code style={{ color: '#f87171' }}>intel</code> as a chip to show all rows with that detection — faster than guessing a score threshold</li>
            <li>Prefix with <code style={{ color: '#ef4444' }}>!</code> or <code style={{ color: '#ef4444' }}>NOT</code> to exclude a category: <code style={{ color: '#ef4444' }}>!intel</code>, <code style={{ color: '#ef4444' }}>NOT strobe</code></li>
            <li>Toggle <strong style={{ color: '#7c85f5' }}>OR</strong> / <strong style={{ color: '#eab308' }}>AND</strong> to match any or all chips</li>
          </ul>
        </div>
      )}
    </div>
  )
}

export const SCORE_RE    = /^(threat|beacon|longconn|dns|strobe|intel)(>=|<=|>|<|=)(\d{1,3})$/i
export const CATEGORY_RE = /^(threat|beacon|longconn|dns|strobe|intel)$/i
export const SCORE_KEYWORDS = ['threat', 'beacon', 'longconn', 'dns', 'strobe', 'intel']

export const CATEGORY_COLORS = {
  beacon: '#7c85f5', longconn: '#38bdf8', dns: '#a78bfa',
  intel: '#f87171', strobe: '#f97316', threat: '#94a3b8',
}

export function detectChipType(value) {
  if (CATEGORY_RE.test(value)) return 'category'
  if (SCORE_RE.test(value))    return 'score'
  return 'target'
}

export function ChipInput({ chips, onChange }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  const parseRaw = (raw) => {
    const val = raw.trim()
    if (!val) return null
    let negate = false, core = val
    const notMatch = val.match(/^(!|NOT\s+)(.+)$/i)
    if (notMatch) { negate = true; core = notMatch[2].trim() }

    if (CATEGORY_RE.test(core)) return { value: core.toLowerCase(), negate, type: 'category' }

    const scoreMatch = core.match(SCORE_RE)
    if (scoreMatch) {
      const num = parseInt(scoreMatch[3], 10)
      if (num < 0 || num > 100) return null
      return { value: core.toLowerCase(), negate, type: 'score' }
    }
    return { value: core, negate, type: 'target' }
  }

  const add = (raw) => {
    const chip = parseRaw(raw)
    if (!chip) return
    if (chips.some(c => c.value === chip.value)) return
    onChange([...chips, chip])
    setInput('')
  }

  const remove = (val) => onChange(chips.filter(c => c.value !== val))

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
    else if (e.key === ' ' && !input.match(/^not$/i)) { e.preventDefault(); add(input) }
    else if (e.key === 'Backspace' && !input && chips.length) remove(chips[chips.length - 1].value)
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center',
        minHeight: 36, background: '#0f1117', border: '1px solid #2d3148',
        borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'text', flex: 1,
      }}
    >
      {chips.map(chip => {
        const isNeg = chip.negate, isScore = chip.type === 'score', isCategory = chip.type === 'category'
        const color = isNeg ? '#ef4444' : isCategory ? (CATEGORY_COLORS[chip.value] || '#22c55e') : isScore ? '#eab308' : '#7c85f5'
        return (
          <span key={chip.value} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: color + '22', border: `1px solid ${color}55`,
            color, borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 600,
          }}>
            {isNeg && <span style={{ fontSize: 11, opacity: 0.85, marginRight: 2 }}>NOT</span>}
            {chip.value}
            <button onClick={() => remove(chip.value)} style={{
              background: 'none', border: 'none', color, cursor: 'pointer',
              fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7,
            }}>✕</button>
          </span>
        )
      })}
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => input && add(input)}
        placeholder={chips.length ? '' : 'IP, CIDR, FQDN or score filter (e.g. beacon>50)'}
        style={{ flex: 1, minWidth: 180, background: 'none', border: 'none', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
      />
    </div>
  )
}

export default function ChipBar({ chips, setChips, andMode, setAndMode }) {
  return (
    <div style={{
      background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8,
      padding: '0.5rem 0.875rem', marginBottom: '1rem',
      display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 11, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>Filter:</span>
      <button
        onClick={() => setAndMode(false)}
        style={{
          background: !andMode ? '#7c85f522' : 'none', border: `1px solid ${!andMode ? '#7c85f5' : '#2d3148'}`,
          color: !andMode ? '#7c85f5' : '#475569', borderRadius: 4, padding: '1px 8px',
          cursor: 'pointer', fontSize: 11, fontWeight: !andMode ? 700 : 400,
        }}
      >OR</button>
      <button
        onClick={() => setAndMode(true)}
        style={{
          background: andMode ? '#eab30822' : 'none', border: `1px solid ${andMode ? '#eab308' : '#2d3148'}`,
          color: andMode ? '#eab308' : '#475569', borderRadius: 4, padding: '1px 8px',
          cursor: 'pointer', fontSize: 11, fontWeight: andMode ? 700 : 400,
        }}
      >AND</button>
      <ChipInput chips={chips} onChange={setChips} />
      <InfoTooltip />
      {chips.length > 0 && (
        <button
          onClick={() => setChips([])}
          style={{ background: 'none', border: '1px solid #2d3148', color: '#475569', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}
        >Clear</button>
      )}
    </div>
  )
}
