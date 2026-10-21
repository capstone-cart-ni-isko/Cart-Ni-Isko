import StatusBadge from './kit/StatusBadge.jsx'

/**
 * Status pill for admin tables and cards.
 *
 * Item 26 - there is ONE badge system: StatusPill is a thin, backwards
 * compatible front for kit/StatusBadge, so it only decides WHICH tone a value
 * gets and every colour, dot and radius comes from the kit.
 *
 *   active  (brand blue)   in progress: to process / claim / receive, preparing, pre-order…
 *   urgent  (brand orange) needs staff attention: requested, pending, unclaimed, low stock…
 *   lost    (red)          cancelled, returned, refunded, failed, rejected…
 *   done    (quiet, green dot) completed, claimed, ready, published, available, on duty…
 *   neutral (grey)         draft, off duty, unavailable and anything unknown
 * Legacy `variant` values still work: blue/purple/cyan → active, amber → urgent,
 * red → lost, green → done.
 */
const VARIANT_TONE = { blue: 'active', purple: 'active', cyan: 'active', amber: 'urgent', red: 'lost', green: 'done' }

const has = (norm, words) => words.some((word) => norm.includes(word))

function toneFor(norm) {
  // Order matters: "unclaimed" before "claimed", "requested" before the
  // statuses a request refers to, "unavailable" before "available".
  if (has(norm, ['unavailable', 'off duty', 'draft', 'in class', 'busy'])) return 'neutral'
  if (has(norm, ['unclaimed', 'requested', 'pending', 'awaiting', 'warning', 'low stock', 'up next', 'understaffed', 'short'])) return 'urgent'
  if (has(norm, ['cancelled', 'returned', 'refunded', 'failed', 'delayed', 'rejected', 'conflict', 'alert', 'danger', 'no-show', 'no show', 'out of stock'])) return 'lost'
  if (has(norm, ['completed', 'claimed', 'ready', 'published', 'approved', 'available', 'covered', 'received', 'delivered']) || norm === 'on duty') return 'done'
  if (has(norm, ['to process', 'to claim', 'to deliver', 'to receive', 'in production', 'preparing', 'in transit', 'pre-order', 'desk duty', 'online', 'pickup', 'assigned', 'dispatch', 'scheduled', 'on-call', 'active'])) return 'active'
  return 'neutral'
}

export default function StatusPill({ status, variant, className = '' }) {
  if (!status) return null
  const tone = (variant && VARIANT_TONE[variant]) || toneFor(String(status).toLowerCase().trim())

  return (
    <StatusBadge
      tone={tone}
      label={<span className="capitalize">{status}</span>}
      className={className}
    />
  )
}
