import React, { useState } from 'react'

export default function SalesBarChart({ data = [], onNavigateReport }) {
  const [metric, setMetric] = useState('sales') // 'sales' | 'units'

  const maxValue = Math.max(...data.map((d) => (metric === 'sales' ? d.sales : d.units)), 1)

  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-100 p-0.5 rounded-md text-xs font-semibold text-slate-600 border border-slate-200/60">
          <button
            type="button"
            onClick={() => setMetric('sales')}
            className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
              metric === 'sales'
                ? 'bg-brand-orange text-white'
                : 'hover:text-slate-900'
            }`}
          >
            Sales (₱)
          </button>
          <button
            type="button"
            onClick={() => setMetric('units')}
            className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
              metric === 'units'
                ? 'bg-brand-orange text-white'
                : 'hover:text-slate-900'
            }`}
          >
            Units Sold
          </button>
        </div>

        {onNavigateReport && (
          <button
            type="button"
            onClick={onNavigateReport}
            className="text-xs font-semibold text-brand-orange hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View Full Report</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Bar visual area */}
      <div className="pt-4 pb-1">
        <div className="h-36 flex items-end justify-between gap-3 px-2 border-b border-slate-100">
          {data.map((item) => {
            const val = metric === 'sales' ? item.sales : item.units
            const heightPercent = Math.max(15, Math.round((val / maxValue) * 100))

            return (
              <div
                key={item.category}
                className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end"
              >
                {/* Tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-medium py-0.5 px-2 rounded border border-slate-700 pointer-events-none whitespace-nowrap -mb-1">
                  {metric === 'sales' ? `₱${val.toLocaleString()}` : `${val} units`}
                </div>

                {/* Vertical Bar */}
                <div className="w-full max-w-[32px] bg-brand-orange/15 group-hover:bg-brand-orange/25 rounded-t-md transition-all relative overflow-hidden flex items-end">
                  <div
                    className="w-full bg-brand-orange rounded-t-md transition-all duration-500 ease-out group-hover:brightness-110"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>

                {/* X-axis Label */}
                <span className="text-[11px] font-medium text-slate-600 truncate max-w-full">
                  {item.category}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
