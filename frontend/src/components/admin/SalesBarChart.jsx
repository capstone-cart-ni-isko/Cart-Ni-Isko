import React, { useState } from 'react'

export default function SalesBarChart({ data = [], onNavigateReport }) {
  const [metric, setMetric] = useState('sales') // 'sales' | 'units'

  const maxValue = Math.max(...data.map((d) => (metric === 'sales' ? d.sales : d.units)), 1)

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 p-0.5 rounded-lg text-xs font-bold text-gray-600">
          <button
            type="button"
            onClick={() => setMetric('sales')}
            className={`px-3 py-1 rounded-md transition-all ${
              metric === 'sales'
                ? 'bg-brand-orange text-white shadow-xs'
                : 'hover:text-gray-900'
            }`}
          >
            Sales (₱)
          </button>
          <button
            type="button"
            onClick={() => setMetric('units')}
            className={`px-3 py-1 rounded-md transition-all ${
              metric === 'units'
                ? 'bg-brand-orange text-white shadow-xs'
                : 'hover:text-gray-900'
            }`}
          >
            Units Sold
          </button>
        </div>

        {onNavigateReport && (
          <button
            type="button"
            onClick={onNavigateReport}
            className="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1"
          >
            View Full Report <span className="text-[10px]">➔</span>
          </button>
        )}
      </div>

      {/* Bar visual area */}
      <div className="pt-6 pb-2">
        <div className="h-44 flex items-end justify-between gap-4 px-2 border-b border-gray-100">
          {data.map((item) => {
            const val = metric === 'sales' ? item.sales : item.units
            const heightPercent = Math.max(15, Math.round((val / maxValue) * 100))

            return (
              <div
                key={item.category}
                className="flex-1 flex flex-col items-center gap-2 group h-full justify-end"
              >
                {/* Tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-bold py-1 px-2 rounded pointer-events-none whitespace-nowrap shadow-md -mb-1">
                  {metric === 'sales' ? `₱${val.toLocaleString()}` : `${val} units`}
                </div>

                {/* Vertical Bar */}
                <div className="w-full max-w-[38px] bg-brand-orange/15 group-hover:bg-brand-orange/25 rounded-t-lg transition-all relative overflow-hidden flex items-end">
                  <div
                    className="w-full bg-brand-orange rounded-t-lg transition-all duration-500 ease-out group-hover:brightness-110"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>

                {/* X-axis Label */}
                <span className="text-xs font-bold text-gray-600 truncate max-w-full">
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
