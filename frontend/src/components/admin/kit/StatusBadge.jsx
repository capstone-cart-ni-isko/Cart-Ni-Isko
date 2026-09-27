import { TONE_CLASSES, statusTone } from './statusTone.js'

/** Order status pill in the dashboard's unified palette. */
export default function StatusBadge({ rawStatus, label }) {
  const tone = statusTone(rawStatus)
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-[11px] font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {tone === 'done' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
      {label || rawStatus}
    </span>
  )
}
