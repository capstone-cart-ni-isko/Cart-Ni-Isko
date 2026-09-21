import React, { useState } from 'react'

const CHART_HEIGHT = 160
const TICK_STEPS = 4

// Round the axis maximum up to a "nice" number so ticks read cleanly
function getScale(max, metric) {
  if (max <= 0) return { step: 1, niceMax: TICK_STEPS }
  const rough = max / TICK_STEPS
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const frac = rough / pow
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  let step = nice * pow
  if (metric === 'units' && step < 1) step = 1
  return { step, niceMax: step * TICK_STEPS }
}

function formatTick(value, metric) {
  if (metric === 'units') return String(value)
  if (value >= 1000) return `₱${Number.isInteger(value / 1000) ? value / 1000 : (value / 1000).toFixed(1)}k`
  return `₱${value}`
}

export default function SalesBarChart({ data = [] }) {
  const [metric, setMetric] = useState('sales') // 'sales' | 'units'

  const getValue = (d) => (metric === 'sales' ? d.sales : d.units) || 0
  const maxValue = Math.max(...data.map(getValue), 0)
  const { step, niceMax } = getScale(maxValue, metric)
  const ticks = Array.from({ length: TICK_STEPS + 1 }, (_, i) => i * step)

  return (
    <div className="space-y-3">
      {/* Metric toggle */}
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-100 p-0.5 rounded-md text-xs font-semibold text-slate-600 border border-slate-200/60">
          <button
            type="button"
            onClick={() => setMetric('sales')}
            className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
              metric === 'sales' ? 'bg-brand-orange text-white' : 'hover:text-slate-900'
            }`}
          >
            Sales (₱)
          </button>
          <button
            type="button"
            onClick={() => setMetric('units')}
            className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
              metric === 'units' ? 'bg-brand-orange text-white' : 'hover:text-slate-900'
            }`}
          >
            Units Sold
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex gap-2 pt-2">
        {/* Y-axis labels */}
        <div className="relative shrink-0 w-10" style={{ height: CHART_HEIGHT }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 text-[10px] font-medium text-slate-400 tabular-nums leading-none"
              style={{ bottom: `${(t / niceMax) * 100}%` }}
            >
              {formatTick(t, metric)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: CHART_HEIGHT }}>
            {/* Horizontal gridlines */}
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute left-0 right-0 border-t ${t === 0 ? 'border-slate-200' : 'border-slate-100'}`}
                style={{ bottom: `${(t / niceMax) * 100}%` }}
              />
            ))}

            {/* Vertical bars */}
            <div className="absolute inset-0 flex items-end justify-around gap-3 px-2">
              {data.map((item) => {
                const val = getValue(item)
                const heightPercent = (val / niceMax) * 100
                return (
                  <div
                    key={item.category}
                    className="group relative flex-1 h-full flex items-end justify-center"
                  >
                    <div
                      className="absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-medium py-0.5 px-2 rounded pointer-events-none whitespace-nowrap z-10"
                      style={{ bottom: `calc(${heightPercent}% + 4px)` }}
                    >
                      {metric === 'sales' ? `₱${val.toLocaleString()}` : `${val} units`}
                    </div>
                    <div
                      className="w-full max-w-[32px] bg-brand-orange rounded-t-md transition-all duration-500 ease-out"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-around gap-3 px-2 mt-1.5">
            {data.map((item) => (
              <span
                key={item.category}
                className="flex-1 text-center text-[11px] font-medium text-slate-600 truncate"
              >
                {item.category}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}