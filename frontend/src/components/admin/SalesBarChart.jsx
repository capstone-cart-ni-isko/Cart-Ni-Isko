import { useState } from 'react'

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

/*
  Category bar chart that fills its container's height, so it keeps the same
  proportions inside its card at any screen size. With no data it says so
  instead of drawing an axis for values that do not exist.
*/
export default function SalesBarChart({ data = [] }) {
  const [metric, setMetric] = useState('sales') // 'sales' | 'units'

  const getValue = (d) => (metric === 'sales' ? d.sales : d.units) || 0
  const maxValue = Math.max(...data.map(getValue), 0)
  const { step, niceMax } = getScale(maxValue, metric)
  const ticks = Array.from({ length: TICK_STEPS + 1 }, (_, i) => i * step)
  const empty = maxValue <= 0

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Metric toggle (same segmented control as the range filter) */}
      <div className="inline-flex self-start h-7 p-0.5 bg-slate-100 rounded-md shrink-0" role="radiogroup" aria-label="Chart metric">
        {[
          ['sales', 'Sales (₱)'],
          ['units', 'Units sold'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={metric === key}
            onClick={() => setMetric(key)}
            className={`h-6 px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
              metric === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 text-center px-4">
          <p className="text-xs font-medium text-slate-600">No sales in this period</p>
          <p className="text-[11px] text-slate-400">Category totals appear here as orders come in.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex gap-2 pt-1.5">
            {/* Y-axis labels */}
            <div className="relative shrink-0 w-10">
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

            <div className="relative flex-1 min-w-0">
              {/* Horizontal gridlines */}
              {ticks.map((t) => (
                <div
                  key={t}
                  className={`absolute left-0 right-0 border-t ${t === 0 ? 'border-slate-300' : 'border-slate-100'}`}
                  style={{ bottom: `${(t / niceMax) * 100}%` }}
                />
              ))}

              {/* Vertical bars */}
              <div className="absolute inset-0 flex items-end justify-around gap-3 px-2">
                {data.map((item) => {
                  const val = getValue(item)
                  const heightPercent = (val / niceMax) * 100
                  return (
                    <div key={item.category} className="group relative flex-1 h-full flex items-end justify-center">
                      <div
                        className="absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-medium py-0.5 px-2 rounded pointer-events-none whitespace-nowrap z-10"
                        style={{ bottom: `calc(${heightPercent}% + 4px)` }}
                      >
                        {metric === 'sales' ? `₱${val.toLocaleString()}` : `${val} units`}
                      </div>
                      <div
                        className="w-full max-w-[32px] bg-slate-700 group-hover:bg-slate-900 rounded-t transition-all duration-500 ease-out"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* X-axis labels */}
          <div className="flex gap-2 shrink-0 mt-1.5">
            <div className="w-10 shrink-0" />
            <div className="flex-1 min-w-0 flex justify-around gap-3 px-2">
              {data.map((item) => (
                <span key={item.category} className="flex-1 text-center text-[11px] font-medium text-slate-600 truncate">
                  {item.category}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
