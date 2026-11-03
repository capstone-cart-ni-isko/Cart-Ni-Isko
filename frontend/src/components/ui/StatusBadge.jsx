function StatusBadge({ status, className = '', appearance = 'default' }) {
  const normalized = status.toUpperCase().replace(/_/g, ' ')
  const isStatusPill = appearance === 'status-pill'
  const label = isStatusPill
    ? normalized.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : normalized

  // SRS order pipeline: To Process, To Claim, To Receive, Claimed,
  // Unclaimed, Cancelled, Returned, Refunded (+ pending request states).
  // Each tone maps onto a shared `.badge` modifier so the pill reads theme
  // tokens (correct in dark mode) and sits on the 11px system floor.
  let tone = 'badge--plain' // fallback

  if (
    normalized === 'AWAITING PAYMENT' ||
    normalized === 'TO PROCESS' ||
    normalized === 'PROCESSING' ||
    normalized === 'PREPARING' ||
    normalized === 'CONFIRMED' ||
    normalized === 'IN PRODUCTION' ||
    normalized === 'FOR PRE-ORDER' ||
    normalized === 'PRE-ORDER'
  ) {
    tone = 'badge--warn'
  } else if (
    normalized === 'TO CLAIM' ||
    normalized === 'TO DELIVER' ||
    normalized === 'READY TO SHIP' ||
    normalized === 'IN TRANSIT' ||
    normalized === 'TO RECEIVE' ||
    normalized === 'READY FOR PICK-UP' ||
    normalized === 'PICK-UP' ||
    normalized === 'TRANSIT'
  ) {
    tone = 'badge--info'
  } else if (normalized === 'CLAIMED' || normalized === 'DELIVERED') {
    tone = 'badge--ok'
  } else if (normalized === 'UNCLAIMED') {
    tone = 'badge--brand'
  } else if (normalized === 'CANCEL REQUESTED' || normalized === 'RETURN REQUESTED') {
    tone = 'badge--accent'
  } else if (normalized === 'CANCELLED' || normalized === 'FAILED') {
    tone = 'badge--danger'
  } else if (normalized === 'RETURNED') {
    tone = 'badge--danger'
  } else if (normalized === 'REFUNDED') {
    tone = 'badge--plain'
  }

  return (
    <span
      className={`badge ${tone} ${isStatusPill ? 'badge--status-pill' : 'uppercase tracking-wider'} ${className}`}
    >
      {label}
    </span>
  )
}

export default StatusBadge
