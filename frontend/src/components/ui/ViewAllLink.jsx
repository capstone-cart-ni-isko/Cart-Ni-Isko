import { Link } from 'react-router-dom'

function ChevronIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}


function ViewAllLink({
  to,
  onClick,
  children = 'View all',
  tone = 'slate',
  className = '',
}) {
  const tones = {
    slate: 'text-slate-500 hover:text-slate-900',
    orange: 'text-brand-orange hover:text-brand-orange-dark',
  }

  const base = `inline-flex items-center gap-1 text-xs font-semibold transition-colors cursor-pointer ${
    tones[tone] || tones.slate
  } ${className}`

  if (!to) {
    return (
      <button type="button" onClick={onClick} className={base}>
        <span>{children}</span>
        <ChevronIcon />
      </button>
    )
  }

  return (
    <Link to={to} onClick={onClick} className={base}>
      <span>{children}</span>
      <ChevronIcon />
    </Link>
  )
}

export default ViewAllLink
export { ChevronIcon }