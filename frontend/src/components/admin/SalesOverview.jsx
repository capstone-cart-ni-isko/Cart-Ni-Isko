import { useMemo, useState } from 'react'

/**
 * Sales Overview (FLOW-ANALYTICS-03): revenue by order type over the selected
 * window, plus the order-type mix and the sales-by-category ranking.
 *
 * Colour follows the order type, never its rank, and the three hues are the
 * validated categorical slots (light / dark steps): every pair stays apart
 * under colour-vision deficiency. Identity is never colour alone: the legend
 * carries names and values, the tooltip names every segment, and a table view
 * shows the same numbers as text.
 */
const SERIES = [
  { key: 'online', label: 'Online', swatch: 'bg-[#1baf7a] dark:bg-[#199e70]' },
  { key: 'walkin', label: 'Walk-in', swatch: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
  { key: 'preorder', label: 'Pre-order', swatch: 'bg-[#eb6834] dark:bg-[#d95926]' },
]

// Sales by category is one series, so it wears one hue (magnitude, not identity).
const CATEGORY_FILL = 'bg-[#2a78d6] dark:bg-[#3987e5]'
const CATEGORY_LIMIT = 5

const peso = (value, digits = 2) =>
  `₱${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`

/** ₱980 · ₱2.2K · ₱15K · ₱1.2M - short enough to sit above a bar. */
function compactPeso(value) {
  const n = Number(value) || 0
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `₱${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return `₱${Math.round(n).toLocaleString('en-US')}`
}

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0)
const pctLabel = (part, whole) => `${pct(part, whole).toFixed(whole > 0 && pct(part, whole) < 10 ? 1 : 0)}%`

/** A "nice" axis ceiling and its 4 even steps (1 / 2 / 2.5 / 5 x 10^n). */
function niceScale(max) {
  if (!(max > 0)) return { top: 1000, ticks: [0, 250, 500, 750, 1000] }
  const rough = max / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) || 10 * mag
  const top = step * Math.ceil(max / step)
  const ticks = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return { top, ticks }
}

function Swatch({ className }) {
  return <span aria-hidden="true" className={`inline-block w-2.5 h-2.5 rounded-[3px] shrink-0 ${className}`} />
}

export default function SalesOverview({
  trendData = [],
  orderMix,
  categorySales = [],
  rangeLabel = '',
  bucketUnit = 'day',
}) {
  const [view, setView] = useState('chart')
  const [active, setActive] = useState(null)

  const { top, ticks } = useMemo(
    () => niceScale(Math.max(0, ...trendData.map((d) => d.total || 0))),
    [trendData]
  )
  const peakIndex = useMemo(() => {
    let best = -1
    trendData.forEach((d, i) => {
      if (d.total > 0 && (best < 0 || d.total > trendData[best].total)) best = i
    })
    return best
  }, [trendData])
  const hasSales = trendData.some((d) => d.total > 0)

  // Top categories, the long tail folded into "Other" so the list stays short.
  const categories = useMemo(() => {
    const sorted = [...categorySales].sort((a, b) => b.sales - a.sales)
    const head = sorted.slice(0, CATEGORY_LIMIT)
    const tail = sorted.slice(CATEGORY_LIMIT)
    if (tail.length) {
      head.push(
        tail.reduce(
          (acc, c) => ({ ...acc, sales: acc.sales + c.sales, units: acc.units + c.units }),
          { category: `Other (${tail.length})`, sales: 0, units: 0 }
        )
      )
    }
    return head
  }, [categorySales])
  const categoryTotal = categories.reduce((sum, c) => sum + c.sales, 0)
  const categoryMax = Math.max(1, ...categories.map((c) => c.sales))

  const mixTotal = SERIES.reduce((sum, s) => sum + (orderMix?.[s.key]?.sales || 0), 0)
  const dense = trendData.length > 7
  const activePoint = active != null ? trendData[active] : null

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100/90 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-gray-900">Sales Overview</h2>
          <p className="text-xs text-gray-500 font-medium">
            Revenue by order type and category{rangeLabel ? ` · ${rangeLabel}` : ''}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Sales overview view"
          className="flex self-start bg-gray-100 p-0.5 rounded-lg"
        >
          {['chart', 'table'].map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => setView(mode)}
              className={`px-3 h-7 rounded-md text-xs font-semibold capitalize transition-colors cursor-pointer ${
                view === mode ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Order-type mix (doubles as the legend). Total revenue lives in the
          KPI cards above, so it is not repeated here. */}
      <div>
        <div className="space-y-3">
          {/* 100% mix bar - 2px surface gaps between segments */}
          <div className="flex h-2.5 w-full gap-[2px] rounded-full overflow-hidden bg-gray-100" aria-hidden="true">
            {mixTotal > 0 &&
              SERIES.map((s) => {
                const share = pct(orderMix?.[s.key]?.sales || 0, mixTotal)
                return share > 0 ? (
                  <div key={s.key} className={`h-full ${s.swatch}`} style={{ width: `${share}%` }} />
                ) : null
              })}
          </div>
          <ul className="grid grid-cols-3 gap-3">
            {SERIES.map((s) => {
              const entry = orderMix?.[s.key] || { sales: 0, orders: 0 }
              return (
                <li key={s.key} className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    <Swatch className={s.swatch} />
                    <span className="truncate">{s.label}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 tabular-nums mt-0.5 truncate">
                    {peso(entry.sales, 0)}
                  </p>
                  <p className="text-2xs text-gray-500 font-medium tabular-nums">
                    {pctLabel(entry.sales, mixTotal)} · {entry.orders} order{entry.orders === 1 ? '' : 's'}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Trend: chart or table */}
      {view === 'chart' ? (
        <div className="relative">
          <div className="flex">
            {/* Y axis */}
            <div className="relative w-12 shrink-0 h-64" aria-hidden="true">
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-2 translate-y-1/2 text-2xs font-medium text-gray-400 tabular-nums"
                  style={{ bottom: `${(t / top) * 100}%` }}
                >
                  {compactPeso(t)}
                </span>
              ))}
            </div>

            {/* Plot */}
            <div className="relative flex-1 min-w-0">
              <div className="relative h-64" onMouseLeave={() => setActive(null)}>
                {/* Recessive grid */}
                {ticks.map((t) => (
                  <div
                    key={t}
                    aria-hidden="true"
                    className={`absolute inset-x-0 border-t ${t === 0 ? 'border-gray-200' : 'border-dashed border-gray-100'}`}
                    style={{ bottom: `${(t / top) * 100}%` }}
                  />
                ))}

                {!hasSales && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-400">
                    No sales recorded in this period.
                  </div>
                )}

                <div className="absolute inset-0 flex">
                  {trendData.map((point, i) => {
                    const isActive = active === i
                    const totalPct = (point.total / top) * 100
                    const segments = SERIES.filter((s) => point[s.key] > 0)
                    return (
                      <button
                        key={`${point.date}-${i}`}
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive(null)}
                        onClick={() => setActive(isActive ? null : i)}
                        aria-label={`${point.date}: ${peso(point.total)} total, ${SERIES.map(
                          (s) => `${s.label} ${peso(point[s.key])}`
                        ).join(', ')}, ${point.orders || 0} orders`}
                        className={`relative flex-1 h-full flex justify-center items-end cursor-pointer focus:outline-none rounded-md transition-colors ${
                          isActive ? 'bg-gray-50' : ''
                        }`}
                      >
                        {/* Stacked bar: Online at the base, 2px gaps, rounded top */}
                        <div className="relative w-[58%] max-w-[44px] h-full flex flex-col-reverse">
                          {segments.map((s, idx) => {
                            const h = (point[s.key] / top) * 100
                            const isTop = idx === segments.length - 1
                            return (
                              <div
                                key={s.key}
                                className={`w-full shrink-0 ${s.swatch} ${isTop ? 'rounded-t-[4px]' : ''} ${
                                  active != null && !isActive ? 'opacity-50' : ''
                                } transition-opacity`}
                                style={{
                                  height: `max(calc(${h}% - ${idx > 0 ? 2 : 0}px), 1px)`,
                                  marginBottom: idx > 0 ? '2px' : 0,
                                }}
                              />
                            )
                          })}
                          {point.total > 0 && (
                            <span
                              className={`absolute left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded-md bg-gray-100 text-2xs font-bold text-gray-700 tabular-nums whitespace-nowrap ${
                                dense ? 'hidden sm:inline-block' : 'inline-block'
                              }`}
                              style={{ bottom: `${totalPct}%` }}
                            >
                              {compactPeso(point.total)}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Tooltip */}
                {activePoint && (
                  <div
                    role="status"
                    className="absolute top-0 z-20 w-48 rounded-xl bg-gray-900 dark:bg-[var(--surface-3)] text-white dark:text-[var(--ink)] shadow-xl p-3 pointer-events-none text-xs space-y-1.5"
                    style={
                      active > trendData.length / 2
                        ? { right: `${((trendData.length - active) / trendData.length) * 100}%`, marginRight: 4 }
                        : { left: `${((active + 1) / trendData.length) * 100}%`, marginLeft: 4 }
                    }
                  >
                    <p className="font-bold">{activePoint.date}</p>
                    {SERIES.slice()
                      .reverse()
                      .map((s) => (
                        <div key={s.key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 opacity-80">
                            <Swatch className={s.swatch} />
                            {s.label}
                          </span>
                          <span className="tabular-nums font-semibold">
                            {peso(activePoint[s.key], 0)}
                            <span className="opacity-60 font-medium"> · {pctLabel(activePoint[s.key], activePoint.total)}</span>
                          </span>
                        </div>
                      ))}
                    <div className="flex justify-between gap-3 border-t border-white/15 pt-1.5 font-bold">
                      <span>Total</span>
                      <span className="tabular-nums">{peso(activePoint.total)}</span>
                    </div>
                    <p className="opacity-60 font-medium">
                      {activePoint.orders || 0} order{activePoint.orders === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
              </div>

              {/* X axis */}
              <div className="flex pt-2" aria-hidden="true">
                {trendData.map((point, i) => (
                  <div key={`${point.date}-${i}`} className="flex-1 min-w-0 text-center">
                    <p
                      className={`text-2xs sm:text-xs truncate ${
                        i === peakIndex ? 'font-bold text-gray-900' : 'font-medium text-gray-500'
                      }`}
                    >
                      {point.date}
                    </p>
                    {i === peakIndex && (
                      <p className="text-2xs font-semibold text-brand-orange leading-tight">Peak</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-100 text-2xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-3">Period</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-2 px-3 text-right">{s.label}</th>
                ))}
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 pl-3 text-right">Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700 tabular-nums">
              {trendData.map((point, i) => (
                <tr key={`${point.date}-${i}`}>
                  <td className="py-2 pr-3 font-semibold text-gray-900">
                    {point.date}
                    {i === peakIndex && <span className="ml-1.5 text-2xs font-semibold text-brand-orange">Peak</span>}
                  </td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-2 px-3 text-right">{peso(point[s.key])}</td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold text-gray-900">{peso(point.total)}</td>
                  <td className="py-2 pl-3 text-right">{point.orders || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick insights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500">Best {bucketUnit}</p>
          <p className="text-sm font-bold text-gray-900 truncate">
            {peakIndex >= 0 ? trendData[peakIndex].date : '—'}
          </p>
          <p className="text-2xs text-gray-500 font-medium tabular-nums">
            {peakIndex >= 0 ? peso(trendData[peakIndex].total) : 'No sales yet'}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500">Top category</p>
          <p className="text-sm font-bold text-gray-900 truncate">{categories[0]?.category || '—'}</p>
          <p className="text-2xs text-gray-500 font-medium tabular-nums">
            {categories[0] ? `${peso(categories[0].sales, 0)} · ${pctLabel(categories[0].sales, categoryTotal)} of sales` : 'No sales yet'}
          </p>
        </div>
      </div>

      {/* Sales by category */}
      <div className="space-y-3 border-t border-gray-100 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-black text-gray-900">Sales by category</h3>
        </div>
        {categories.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center">No category sales in this period.</p>
        ) : (
          <ul className="space-y-2.5">
            {categories.map((c) => (
              <li
                key={c.category}
                className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_4.5rem] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5.5rem] items-center gap-3"
                title={`${c.category}: ${peso(c.sales)} (${pctLabel(c.sales, categoryTotal)}), ${c.units} units`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{c.category}</p>
                  <p className="text-2xs text-gray-500 font-medium tabular-nums">
                    {c.units} unit{c.units === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                  <div
                    className={`h-full rounded-r-[4px] ${CATEGORY_FILL}`}
                    style={{ width: `${Math.max(1, (c.sales / categoryMax) * 100)}%` }}
                  />
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-xs font-bold text-gray-900">{peso(c.sales, 0)}</p>
                  <p className="text-2xs text-gray-500 font-medium">{pctLabel(c.sales, categoryTotal)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
