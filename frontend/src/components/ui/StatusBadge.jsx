function StatusBadge({ status, className = '' }) {
  const normalized = status.toUpperCase().replace(/_/g, ' ')

  // SRS order pipeline: To Process, To Claim, To Receive, Claimed,
  // Unclaimed, Cancelled, Returned, Refunded (+ pending request states)
  let colorClasses = 'bg-gray-100 text-gray-800' // fallback

  if (
    normalized === 'TO PROCESS' ||
    normalized === 'PROCESSING' ||
    normalized === 'PREPARING' ||
    normalized === 'CONFIRMED' ||
    normalized === 'IN PRODUCTION' ||
    normalized === 'FOR PRE-ORDER' ||
    normalized === 'PRE-ORDER'
  ) {
    colorClasses = 'bg-amber-100 text-amber-800'
  } else if (
    normalized === 'TO CLAIM' ||
    normalized === 'TO RECEIVE' ||
    normalized === 'READY FOR PICK-UP' ||
    normalized === 'PICK-UP' ||
    normalized === 'TRANSIT'
  ) {
    colorClasses = 'bg-indigo-100 text-indigo-800'
  } else if (normalized === 'CLAIMED' || normalized === 'DELIVERED') {
    colorClasses = 'bg-green-100 text-green-800'
  } else if (normalized === 'UNCLAIMED') {
    colorClasses = 'bg-orange-100 text-orange-800'
  } else if (normalized === 'CANCEL REQUESTED' || normalized === 'RETURN REQUESTED') {
    colorClasses = 'bg-rose-100 text-rose-700'
  } else if (normalized === 'CANCELLED' || normalized === 'FAILED') {
    colorClasses = 'bg-red-100 text-red-800'
  } else if (normalized === 'RETURNED') {
    colorClasses = 'bg-red-50 text-red-700'
  } else if (normalized === 'REFUNDED') {
    colorClasses = 'bg-purple-100 text-purple-800'
  }

  return (
    <span
      className={`inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${colorClasses} ${className}`}
    >
      {normalized}
    </span>
  )
}

export default StatusBadge
