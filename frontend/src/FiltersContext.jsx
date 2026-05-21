import { createContext, useContext, useState } from 'react'

const FiltersContext = createContext(null)

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

export const DATE_RANGES = [
  { label: 'Last 24 Hours', hours: 24 },
  { label: 'Last 7 Days',   hours: 24 * 7 },
  { label: 'Last 30 Days',  hours: 24 * 30 },
  { label: 'Last 90 Days',  hours: 24 * 90 },
  { label: 'Last Year',     hours: 24 * 365 },
  { label: 'All Time',      hours: null },
  { label: 'Custom',        hours: 'custom' },
]

export function FiltersProvider({ children }) {
  const [globalFilter,    setGlobalFilterState]    = useState(() => load('rita_filter', ''))
  const [dateRangeHours,  setDateRangeHoursState]  = useState(() => load('rita_date_hours', null))
  const [customDateFrom,  setCustomDateFromState]   = useState(() => load('rita_date_from', ''))
  const [customDateTo,    setCustomDateToState]     = useState(() => load('rita_date_to', ''))
  const [minScore,        setMinScoreState]         = useState(() => load('rita_min_score', 0))
  const [beaconType,      setBeaconTypeState]       = useState(() => load('rita_beacon_type', ''))
  const [threatIntelOnly, setThreatIntelOnlyState]  = useState(() => load('rita_ti_only', false))
  const [protocol,        setProtocolState]         = useState(() => load('rita_protocol', ''))

  const setGlobalFilter    = v => { save('rita_filter', v);        setGlobalFilterState(v) }
  const setDateRangeHours  = v => { save('rita_date_hours', v);    setDateRangeHoursState(v) }
  const setCustomDateFrom  = v => { save('rita_date_from', v);     setCustomDateFromState(v) }
  const setCustomDateTo    = v => { save('rita_date_to', v);       setCustomDateToState(v) }
  const setMinScore        = v => { save('rita_min_score', v);     setMinScoreState(v) }
  const setBeaconType      = v => { save('rita_beacon_type', v);   setBeaconTypeState(v) }
  const setThreatIntelOnly = v => { save('rita_ti_only', v);       setThreatIntelOnlyState(v) }
  const setProtocol        = v => { save('rita_protocol', v);      setProtocolState(v) }

  return (
    <FiltersContext.Provider value={{
      globalFilter,    setGlobalFilter,
      dateRangeHours,  setDateRangeHours,
      customDateFrom,  setCustomDateFrom,
      customDateTo,    setCustomDateTo,
      minScore,        setMinScore,
      beaconType,      setBeaconType,
      threatIntelOnly, setThreatIntelOnly,
      protocol,        setProtocol,
    }}>
      {children}
    </FiltersContext.Provider>
  )
}

export function useFilters() {
  return useContext(FiltersContext)
}
