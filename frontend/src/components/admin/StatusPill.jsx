import { TONE_CLASSES } from './kit/statusTone.js'

/**
 * Status pill for admin tables and cards, on the kit palette (kit/statusTone.js):
 *   active  (brand blue)   in progress: to process / claim / receive, preparing, pre-order…
 *   urgent  (brand orange) needs staff attention: requested, pending, unclaimed, low stock…
 *   lost    (red)          cancelled, returned, refunded, failed, rejected…
 *   done    (quiet, green dot) completed, claimed, ready, published, available, on duty…
 *   neutral (grey)         draft, off duty, unavailable and anything unknown
 * Legacy `variant` values still work: blue/purple/cyan → active, amber → urgent,
 * red → lost, green → done.
 */
const VARIANT_TONE = { blue: 'active', purple: 'active', cyan: 'active', amber: 'urgent', red: 'lost', green: 'done' }

const DOT = {
  neutral: 'bg-slate-400',
  active: 'bg-isko-blue',
  done: 'bg-emerald-500',
  urgent: 'bg-isko-orange',
  lost: 'bg-rose-500',
}

const has = (norm, words) => words.some((word) => norm.includes(word))

function toneFor(norm) {
  // Order matters: "unclaimed" before "claimed", "requested" before the
  // statuses a request refers to, "unavailable" before "available".
  if (has(norm, ['unavailable', 'off duty', 'draft', 'in class', 'busy'])) return 'neutral'
  if (has(norm, ['unclaimed', 'requested', 'pending', 'awaiting', 'warning', 'low stock', 'up next', 'understaffed', 'short'])) return 'urgent'
  if (has(norm, ['cancelled', 'returned', 'refunded', 'failed', 'delayed', 'rejected', 'conflict', 'alert', 'danger', 'no-show', 'no show', 'out of stock'])) return 'lost'
  if (has(norm, ['completed', 'claimed', 'ready', 'published', 'approved', 'available', 'covered', 'received', 'delivered']) || norm === 'on duty') return 'done'
  if (has(norm, ['to process', 'to claim', 'to receive', 'in production', 'preparing', 'in transit', 'pre-order', 'desk duty', 'online', 'pickup', 'assigned', 'dispatch', 'scheduled', 'on-call', 'active'])) return 'active'
  return 'neutral'
}

export default function StatusPill({ status, variant, className = '' }) {
  if (!status) return null
  const tone = (variant && VARIANT_TONE[variant]) || toneFor(String(status).toLowerCase().trim())

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-[11px] font-medium whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[tone]}`} />
      <span className="capitalize">{status}</span>
    </span>
  )
}
