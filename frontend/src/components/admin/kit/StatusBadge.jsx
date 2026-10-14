import { TONE_CLASSES, statusTone } from './statusTone.js'

/** The tone dot, one per palette tone (kit/statusTone.js) - the ONLY dot. */
const DOT = {
  neutral: 'bg-slate-400',
  active: 'bg-isko-blue',
  done: 'bg-emerald-500',
  urgent: 'bg-isko-orange',
  lost: 'bg-rose-500',
}

/**
 * The one status badge of the admin portal (item 26: no page rolls its own).
 *
 *   rawStatus  a backend status ('TO CLAIM'), mapped through statusTone()
 *   tone       pass an explicit tone when the value is not an order status
 *              (a category, a log level, a scan result…)
 *   label      display text; defaults to rawStatus
 *   className  extra utilities (size/space only - colours come from the tone)
 */
export default function StatusBadge({ rawStatus, label, tone, className = '' }) {
  const resolved = (tone && TONE_CLASSES[tone] && tone) || statusTone(rawStatus) || 'neutral'
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-2xs font-medium whitespace-nowrap ${TONE_CLASSES[resolved]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[resolved]}`} />
      {label ?? rawStatus}
    </span>
  )
}
