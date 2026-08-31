import React, { useState, useMemo } from 'react'

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
    <div className="space-y-4">
      {/* Top filters / actions bar */}
      {(filtersSlot || actions) && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1">{filtersSlot}</div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Table container */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                {selectable && (
                  <th className="py-3.5 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key || col.header}
                    className={`py-3.5 px-4 font-extrabold ${col.className || ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="py-12 text-center text-gray-400 font-medium"
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
                      className={`hover:bg-gray-50/50 transition-colors ${
                        isSelected ? 'bg-orange-50/30' : ''
                      }`}
                    >
                      {selectable && (
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectOne(rowId)}
                            className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key || col.header}
                          className={`py-3.5 px-4 ${col.cellClassName || ''}`}
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

        {/* Pagination controls matching wireframe */}
        <div className="px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-medium bg-white">
          <div className="flex items-center gap-2">
            <span>
              Showing{' '}
              <strong className="text-gray-900 font-bold">
                {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}
              </strong>{' '}
              -{' '}
              <strong className="text-gray-900 font-bold">
                {Math.min(currentPage * pageSize, totalItems)}
              </strong>{' '}
              of <strong className="text-gray-900 font-bold">{totalItems}</strong> items
            </span>

            {pageSizeOptions && (
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="ml-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-orange"
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
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
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
                      <span className="px-2 text-gray-400">...</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all ${
                        currentPage === page
                          ? 'bg-brand-orange text-white shadow-xs'
                          : 'hover:bg-gray-100 text-gray-700'
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
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
