import { createContext, useContext, useState } from 'react'

const DatasetContext = createContext(null)

export function DatasetProvider({ children }) {
  const [datasets, setDatasets] = useState([])
  const [dataset, setDataset] = useState('')
  return (
    <DatasetContext.Provider value={{ datasets, setDatasets, dataset, setDataset }}>
      {children}
    </DatasetContext.Provider>
  )
}

export function useDataset() {
  return useContext(DatasetContext)
}
