// Backwards compat shim — real state now lives in FiltersContext
export { useFilters as useFilter } from './FiltersContext'
export { FiltersProvider as FilterProvider } from './FiltersContext'
