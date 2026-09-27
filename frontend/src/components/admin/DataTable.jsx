import React, { useState, useMemo } from 'react'
import { SELECT_SM } from './kit/ui.js'

export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  actions = null,
  filtersSlot = null,
  emptyMessage = 'No records found.',
  defaultPageSize = 10,
  pageSizeOptions = [5, 10, 20, 50],
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  const totalItems = data.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, currentPage, pageSize])

  const handleSelectAll = (e) => {
    if (!onSelectionChange) return
    if (e.target.checked) {
      onSelectionChange(paginatedData.map((d) => d[keyField]))
    } else {
      onSelectionChange([])
    }
  }

  const handleSelectOne = (id) => {
    if (!onSelectionChange) return
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((item) => item !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  const isAllSelected =
    paginatedData.length > 0 &&
    paginatedData.every((d) => selectedIds.includes(d[keyField]))

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      {/* Top filters / actions bar */}
      {(filtersSlot || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex-1">{filtersSlot}</div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Table container */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {selectable && (
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 accent-isko-blue cursor-pointer"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key || col.header}
                    className={`py-2.5 px-3 font-bold ${col.className || ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="py-8 text-center text-slate-400 font-medium"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => {
                  const rowId = row[keyField] || idx
                  const isSelected = selectedIds.includes(rowId)

                  return (
                    <tr
                      key={rowId}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isSelected ? 'bg-isko-blue/5' : ''
                      }`}
                    >
                      {selectable && (
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectOne(rowId)}
                            className="w-4 h-4 rounded border-slate-300 accent-isko-blue cursor-pointer"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key || col.header}
                          className={`py-2 px-3 ${col.cellClassName || ''}`}
                        >
                          {col.render ? col.render(row, idx) : row[col.key]}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="shrink-0 px-3 py-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-500 font-medium bg-white">
          <div className="flex items-center gap-2">
            <span>
              Showing{' '}
              <strong className="text-slate-900 font-semibold">
                {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}
              </strong>{' '}
              -{' '}
              <strong className="text-slate-900 font-semibold">
                {Math.min(currentPage * pageSize, totalItems)}
              </strong>{' '}
              of <strong className="text-slate-900 font-semibold">{totalItems}</strong> items
            </span>

            {pageSizeOptions && (
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className={`ml-2 ${SELECT_SM}`}
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt} / page
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-isko-blue/5 hover:text-isko-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((page, index, array) => {
                const prev = array[index - 1]
                return (
                  <React.Fragment key={page}>
                    {prev && page - prev > 1 && (
                      <span className="px-1 text-slate-400">...</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[26px] h-7 px-1.5 rounded-md text-xs font-semibold transition-all ${
                        currentPage === page
                          ? 'bg-isko-blue text-white'
                          : 'hover:bg-isko-blue/10 text-slate-700 cursor-pointer'
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                )
              })}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 hover:bg-isko-blue/5 hover:text-isko-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
