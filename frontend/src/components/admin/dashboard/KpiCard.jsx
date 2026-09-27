/*
  Top-row metric card. Every KPI shares one hierarchy: label, primary value,
  one line of secondary context. Clickable cards are real buttons so they are
  reachable by keyboard, and show a pressed state while their filter is on.
*/
const TONE_TEXT = {
  up: 'text-emerald-700',
  down: 'text-rose-700',
  neutral: 'text-slate-500',
}

function ToneIcon({ tone }) {
  if (tone === 'neutral') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3" aria-hidden="true">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={`w-3 h-3 ${tone === 'down' ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

export default function KpiCard({ label, value, subtext, tone = 'neutral', icon, onClick, active = false, hint }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      title={hint}
      className={`text-left w-full bg-white rounded-lg border p-3 flex flex-col gap-1 transition-colors ${
        active ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'
      } ${onClick ? 'cursor-pointer hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
          {icon}
        </span>
      </div>
      <span className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums leading-tight">{value}</span>
      <span className={`flex items-center gap-1 text-[11px] font-medium truncate ${TONE_TEXT[tone] || TONE_TEXT.neutral}`}>
        <ToneIcon tone={tone} />
        <span className="truncate">{subtext}</span>
      </span>
    </Tag>
  )
}
