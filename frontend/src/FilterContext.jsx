import { createContext, useContext, useState } from 'react'

const FilterContext = createContext(null)

export function FilterProvider({ children }) {
  const [globalFilter, setGlobalFilter] = useState('')
  return (
    <FilterContext.Provider value={{ globalFilter, setGlobalFilter }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilter() {
  return useContext(FilterContext)
}
