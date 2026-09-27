import { TONE_FILL } from './statusTone.js'

// Stage tones: in-progress stages in brand blue, attention in brand orange
const STAGE_TONE = {
  to_process: 'active',
  to_claim: 'active',
  to_receive: 'active',
  claimed: 'done',
  unclaimed: 'urgent',
  closed: 'lost',
}

/**
 * Rounds the largest count up to a scale whose quarters are whole numbers
 * (4, 8, 20, 40, 80, 200…), so every gridline label is a readable integer.
 */
function niceMax(value) {
  if (value <= 4) return 4
  const base = 10 ** Math.floor(Math.log10(value))
  for (const m of [1, 2, 4, 5, 8, 10]) {
    const candidate = m * base
    if (candidate >= value && candidate % 4 === 0) return candidate
  }
  return Math.ceil(value / 4) * 4
}

/*
  Horizontal stage bars. Width is count / scale with no minimum, so a stage
  with 0 orders shows an empty track. Gridlines at quarters of the scale and
  the count printed at the end of each bar remove any scale guessing. Each row
  is a button that filters the Recent orders table.
*/
export default function FulfillmentBars({ stages = [], activeKey = null, onSelect }) {
  const scale = niceMax(Math.max(...stages.map((s) => s.count), 0))
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="h-full flex flex-col">
      {/* Rows share the card height evenly; bars are sized relative to their
          row, so the chart keeps the same proportions at any resolution. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {stages.map((stage) => {
          const pct = scale > 0 ? (stage.count / scale) * 100 : 0
          const tone = STAGE_TONE[stage.key] || 'neutral'
          const active = activeKey === stage.key
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onSelect?.(stage)}
              aria-pressed={active}
              title={`Show ${stage.label} orders`}
              className={`w-full flex-1 min-h-7 [@media(max-height:760px)]:min-h-6 grid grid-cols-[9rem_1fr] items-center gap-2 px-1.5 rounded-md text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange ${
                active ? 'bg-isko-blue/10' : 'hover:bg-isko-blue/5'
              }`}
            >
              <span className={`text-xs truncate ${active ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                {stage.label}
              </span>
              <span className="relative h-[60%] min-h-4 max-h-7 rounded bg-slate-100">
                {/* Quarter gridlines */}
                {ticks.slice(1, -1).map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-white" style={{ left: `${t * 100}%` }} />
                ))}
                {pct > 0 && (
                  <span
                    className={`absolute inset-y-0 left-0 rounded ${TONE_FILL[tone]} transition-[width] duration-500 ease-out`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                {/* Count callout at the bar end (inside when the bar is long) */}
                <span
                  className={`absolute top-1/2 -translate-y-1/2 text-[11px] font-bold tabular-nums ${
                    pct > 85 ? 'text-white' : 'text-slate-900'
                  }`}
                  style={pct > 85 ? { right: '6px' } : { left: `calc(${pct}% + 6px)` }}
                >
                  {stage.count}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Scale aligned to the bar column */}
      <div className="grid grid-cols-[9rem_1fr] gap-2 px-1.5 pt-1.5 mt-1 border-t border-slate-100 shrink-0">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Orders</span>
        <span className="relative h-3 text-[10px] font-medium text-slate-400 tabular-nums">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${t * 100}%` }}
            >
              {Math.round(t * scale)}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
