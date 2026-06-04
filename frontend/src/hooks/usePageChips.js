import { useState } from 'react'
import { detectChipType } from '../components/ChipBar'

export function usePageChips(storageKey) {
  const [andMode, setAndModeState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey + '_and') || 'false') }
    catch { return false }
  })
  const setAndMode = (v) => {
    try { localStorage.setItem(storageKey + '_and', JSON.stringify(v)) } catch {}
    setAndModeState(v)
  }

  const [chips, setChipsState] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
      return stored.map(c => {
        const chip = typeof c === 'string' ? { value: c, negate: false } : { ...c }
        if (!chip.type) chip.type = detectChipType(chip.value)
        return chip
      })
    } catch { return [] }
  })
  const setChips = (val) => {
    try { localStorage.setItem(storageKey, JSON.stringify(val)) } catch {}
    setChipsState(val)
  }

  const addChip = (value) => {
    if (!value || value === '—') return
    if (chips.some(c => c.value === value)) return
    setChips([...chips, { value, negate: false, type: detectChipType(value) }])
  }

  return { chips, setChips, addChip, andMode, setAndMode }
}
