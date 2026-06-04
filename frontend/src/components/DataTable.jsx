import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender,
} from '@tanstack/react-table'
import { formatIP, matchesFilter } from '../utils'
import { useFilters } from '../FiltersContext'
import DetailPanel from './DetailPanel'
import ContextMenu from './ContextMenu'
import SuppressDialog from './SuppressDialog'

export function ScoreBadge({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e'
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: '2px 8px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
    }}>
      {pct}%
    </span>
  )
}

const PAGE_SIZE = 100

const CELL_STYLE = {
  padding: '0.5rem 1rem',
  borderBottom: '1px solid #1e2235',
  whiteSpace: 'nowrap',
  maxWidth: 260,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const TH_STYLE = {
  padding: '0.6rem 1rem',
  textAlign: 'left',
  background: '#1a1d27',
  borderBottom: '1px solid #2d3148',
  color: '#94a3b8',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
}

const CLICKABLE = ['src', 'dst', 'fqdn']

export default function DataTable({ data, columns, defaultSort, onRefresh, onCellClick, hideGlobalFilter }) {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState(defaultSort || [])
  const { globalFilter, setGlobalFilter } = useFilters()
  const [expanded, setExpanded] = useState({})
  const [selectedRow, setSelectedRow] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [suppressDialog, setSuppressDialog] = useState(null)
  const [page, setPage] = useState(0)

  const { grouped, flatPrimary } = useMemo(() => {
    const grouped = {}
    for (const row of data) {
      const key = `${row.src}||${row.dst}||${row.fqdn}`
      if (!grouped[key]) {
        grouped[key] = { primary: row, children: [] }
      } else {
        const current = grouped[key].primary
        if ((row.beacon_threat_score || 0) > (current.beacon_threat_score || 0)) {
          grouped[key].children.push(current)
          grouped[key].primary = row
        } else {
          grouped[key].children.push(row)
        }
      }
    }
    const flatPrimary = Object.values(grouped).map(g => g.primary)
    return { grouped, flatPrimary }
  }, [data])

  // CIDR-aware filter — applied after TanStack's own filter
  const cidrFilter = globalFilter && (globalFilter.includes('/') || globalFilter.includes('*'))

  const table = useReactTable({
    data: flatPrimary,
    columns,
    state: { sorting, globalFilter: cidrFilter ? '' : globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  // Apply CIDR filter on top of TanStack rows
  const visibleRows = cidrFilter
    ? table.getRowModel().rows.filter(row => {
        const src = formatIP(row.original.src || '')
        const dst = formatIP(row.original.dst || '')
        const fqdn = row.original.fqdn || ''
        return matchesFilter(src, globalFilter) || matchesFilter(dst, globalFilter) || matchesFilter(fqdn, globalFilter)
      })
    : table.getRowModel().rows

  // Reset to first page when filter or data changes
  useEffect(() => { setPage(0) }, [globalFilter, data])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = visibleRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const rangeStart = visibleRows.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, visibleRows.length)

  const handleCellClick = (e, colId, value) => {
    if (CLICKABLE.includes(colId) && value) {
      const selection = window.getSelection()
      if (selection && selection.toString().length > 0) return
      e.stopPropagation()
      if (onCellClick) {
        onCellClick(formatIP(value), colId)
      } else {
        setGlobalFilter(formatIP(value))
      }
    }
  }

  const handleRowClick = (rowData) => {
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) return
    setSelectedRow(rowData)
  }

  // Right-click on a src/dst/fqdn value span — rich field-aware menu
  const handleValueContextMenu = useCallback((e, rowData, colId, value) => {
    e.preventDefault()
    e.stopPropagation()
    const valueTypeMap = { src: 'src', dst: 'dst', fqdn: 'fqdn' }
    const valueType = valueTypeMap[colId]
    const items = [
      {
        icon: '🚫',
        label: `Suppress: ${value}`,
        onClick: () => setSuppressDialog({ row: rowData, valueType }),
      },
      {
        icon: '🔍',
        label: `Add to global filter: ${value}`,
        onClick: () => setGlobalFilter(value),
      },
      {
        icon: '🔎',
        label: `Pivot to Investigate: ${value}`,
        onClick: () => navigate('/investigate', { state: { pivot: value } }),
      },
      'divider',
      {
        icon: '📋',
        label: 'View Details',
        onClick: () => setSelectedRow(rowData),
      },
    ]
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }, [setGlobalFilter, navigate])

  // Right-click anywhere else on the row — view details only
  const handleRowContextMenu = useCallback((e, rowData) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [{ icon: '📋', label: 'View Details', onClick: () => setSelectedRow(rowData) }],
    })
  }, [])

  const toggleExpand = (e, key) => {
    e.stopPropagation()
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const btnStyle = (disabled) => ({
    background: '#1a1d27',
    border: '1px solid #2d3148',
    color: disabled ? '#2d3148' : '#94a3b8',
    borderRadius: 6,
    padding: '0.3rem 0.75rem',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 12,
    fontWeight: 600,
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        {!hideGlobalFilter && (
          <>
            <input
              placeholder="Filter... (or click a src/dst/fqdn)"
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              style={{
                background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0',
                padding: '0.4rem 0.75rem', borderRadius: 6, width: 280,
              }}
            />
            {globalFilter && (
              <button onClick={() => setGlobalFilter('')} style={{
                background: '#2d3148', border: 'none', color: '#94a3b8',
                borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: 12,
              }}>
                Clear
              </button>
            )}
          </>
        )}
        <span style={{ color: '#475569', marginLeft: 'auto', fontSize: 13 }}>
          {visibleRows.length > 0
            ? `${rangeStart}–${rangeEnd} of ${visibleRows.length} rows`
            : '0 rows'}
          {data.length !== flatPrimary.length && ` (${data.length} total with history)`}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                <th style={{ ...TH_STYLE, width: 32 }} />
                {hg.headers.map(header => (
                  <th key={header.id} onClick={header.column.getToggleSortingHandler()} style={TH_STYLE}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted()] ?? ' ↕'}
                  </th>
                ))}
                <th style={{ ...TH_STYLE, width: 32 }} />
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const key = `${row.original.src}||${row.original.dst}||${row.original.fqdn}`
              const group = grouped[key]
              const hasChildren = group?.children?.length > 0
              const isExpanded = expanded[key]

              return [
                <tr
                  key={`row-${row.id}`}
                  onClick={() => handleRowClick(row.original)}
                  onContextMenu={e => handleRowContextMenu(e, row.original)}
                  style={{
                    background: row.original.is_suppressed
                      ? 'rgba(239,68,68,0.07)'
                      : i % 2 === 0 ? '#0f1117' : '#13161f',
                    cursor: 'pointer',
                    borderLeft: row.original.is_suppressed ? '3px solid #ef444466' : '3px solid transparent',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = row.original.is_suppressed ? 'rgba(239,68,68,0.12)' : '#1a1d27'
                    const ch = e.currentTarget.querySelector('.row-chevron')
                    if (ch) ch.style.color = '#94a3b8'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = row.original.is_suppressed ? 'rgba(239,68,68,0.07)' : i % 2 === 0 ? '#0f1117' : '#13161f'
                    const ch = e.currentTarget.querySelector('.row-chevron')
                    if (ch) ch.style.color = '#334155'
                  }}
                >
                  <td
                    style={{ ...CELL_STYLE, width: 32, textAlign: 'center' }}
                    onClick={e => hasChildren && toggleExpand(e, key)}
                  >
                    {hasChildren && (
                      <span style={{
                        color: '#7c85f5', fontSize: 12, display: 'inline-block',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s', cursor: 'pointer',
                      }}>▼</span>
                    )}
                  </td>
                  {row.getVisibleCells().map(cell => {
                    const colId = cell.column.id
                    const isClickable = CLICKABLE.includes(colId)
                    const rawVal = cell.getValue()
                    const hasClickVal = isClickable && rawVal
                    const rendered = flexRender(cell.column.columnDef.cell, cell.getContext())
                    return (
                      <td
                        key={cell.id}
                        style={CELL_STYLE}
                        title={hasClickVal ? undefined : 'Right-click for options'}
                      >
                        {hasClickVal ? (
                          <span
                            onClick={e => handleCellClick(e, colId, rawVal)}
                            onContextMenu={e => handleValueContextMenu(e, row.original, colId, formatIP(rawVal))}
                            onMouseEnter={e => { e.currentTarget.style.color = '#60a5fa' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#93c5fd' }}
                            style={{ color: '#93c5fd', textDecoration: 'underline dotted', cursor: 'pointer' }}
                            title="Left-click to filter · Right-click for options"
                          >
                            {rendered}
                          </span>
                        ) : rendered}
                      </td>
                    )
                  })}
                  <td style={{ ...CELL_STYLE, width: 32, textAlign: 'center', padding: '0.5rem 0.5rem' }}>
                    <span
                      className="row-chevron"
                      style={{
                        color: '#334155', fontSize: 14, display: 'inline-block', lineHeight: 1,
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s, color 0.15s',
                        userSelect: 'none',
                      }}
                    >›</span>
                  </td>
                </tr>,
                ...(isExpanded && hasChildren
                  ? group.children.map((childRow, ci) => (
                      <tr
                        key={`${key}-child-${ci}`}
                        style={{ background: '#0d1020', cursor: 'pointer' }}
                        onClick={() => handleRowClick(childRow)}
                        onContextMenu={e => handleRowContextMenu(e, childRow)}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#1a1d27'
                          const ch = e.currentTarget.querySelector('.row-chevron')
                          if (ch) ch.style.color = '#94a3b8'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#0d1020'
                          const ch = e.currentTarget.querySelector('.row-chevron')
                          if (ch) ch.style.color = '#334155'
                        }}
                      >
                        <td style={{ ...CELL_STYLE, width: 32 }} />
                        {columns.map(col => {
                          const colKey = col.id || col.accessorKey
                          const val = childRow[col.accessorKey]
                          const display = CLICKABLE.includes(col.accessorKey) ? formatIP(val) : val
                          return (
                            <td key={colKey} style={{ ...CELL_STYLE, color: '#64748b', fontSize: 12 }}>
                              {col.cell
                                ? col.cell({ getValue: () => val, row: { original: childRow } })
                                : (display ?? '—')}
                            </td>
                          )
                        })}
                        <td style={{ ...CELL_STYLE, width: 32, textAlign: 'center', padding: '0.5rem 0.5rem' }}>
                          <span
                            className="row-chevron"
                            style={{ color: '#334155', fontSize: 14, lineHeight: 1, userSelect: 'none', transition: 'color 0.15s' }}
                          >›</span>
                        </td>
                      </tr>
                    ))
                  : []
                ),
              ]
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={() => setPage(0)}
            disabled={safePage === 0}
            style={btnStyle(safePage === 0)}
          >
            ««
          </button>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={btnStyle(safePage === 0)}
          >
            ‹ Prev
          </button>
          <span style={{ color: '#94a3b8', fontSize: 13, minWidth: 100, textAlign: 'center' }}>
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={safePage === totalPages - 1}
            style={btnStyle(safePage === totalPages - 1)}
          >
            Next ›
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={safePage === totalPages - 1}
            style={btnStyle(safePage === totalPages - 1)}
          >
            »»
          </button>
        </div>
      )}

      <DetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {suppressDialog && (
        <SuppressDialog
          row={suppressDialog.row}
          valueType={suppressDialog.valueType}
          onClose={() => setSuppressDialog(null)}
          onSuccess={() => {
            setSuppressDialog(null)
            if (onRefresh) onRefresh()
          }}
        />
      )}
    </div>
  )
}
