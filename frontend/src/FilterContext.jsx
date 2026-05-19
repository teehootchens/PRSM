import { createContext, useContext, useState } from 'react'

const FilterContext = createContext(null)

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

export function FilterProvider({ children }) {
  const [globalFilter, setGlobalFilterState] = useState(() => load('rita_filter', ''))

  const setGlobalFilter = (val) => {
    save('rita_filter', val)
    setGlobalFilterState(val)
  }

  return (
    <FilterContext.Provider value={{ globalFilter, setGlobalFilter }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilter() {
  return useContext(FilterContext)
}
