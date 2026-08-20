function StatusBadge({ status, className = '' }) {
  const normalized = status.toUpperCase().replace(/_/g, ' ')

  let colorClasses = 'bg-gray-100 text-gray-800' // fallback

  if (
    normalized === 'CONFIRMED' ||
    normalized === 'IN PRODUCTION' ||
    normalized === 'FOR PRE-ORDER' ||
    normalized === 'PRE-ORDER'
  ) {
    colorClasses = 'bg-[#DBEAFE] text-[#1D4ED8]'
  } else if (normalized === 'PROCESSING' || normalized === 'PREPARING') {
    colorClasses = 'bg-amber-100 text-amber-800'
  } else if (normalized === 'TO RECEIVE' || normalized === 'READY FOR PICK-UP' || normalized === 'PICK-UP') {
    colorClasses = 'bg-indigo-100 text-indigo-800'
  } else if (normalized === 'COMPLETED' || normalized === 'CLAIMED' || normalized === 'DELIVERED') {
    colorClasses = 'bg-green-100 text-green-800'
  } else if (normalized === 'CANCELLED' || normalized === 'FAILED') {
    colorClasses = 'bg-red-100 text-red-800'
  }

  return (
    <span
      className={`inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${colorClasses} ${className}`}
    >
      {normalized}
    </span>
  )
}

export default StatusBadge
