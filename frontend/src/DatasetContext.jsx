import { createContext, useContext, useState } from 'react'

const DatasetContext = createContext(null)

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

export function DatasetProvider({ children }) {
  const [datasets, setDatasetsState] = useState(() => load('rita_datasets', []))
  const [dataset, setDatasetState] = useState(() => load('rita_dataset', ''))

  const setDataset = (val) => {
    save('rita_dataset', val)
    setDatasetState(val)
  }

  const setDatasets = (val) => {
    save('rita_datasets', val)
    setDatasetsState(val)
  }

  return (
    <DatasetContext.Provider value={{ datasets, setDatasets, dataset, setDataset }}>
      {children}
    </DatasetContext.Provider>
  )
}

export function useDataset() {
  return useContext(DatasetContext)
}
