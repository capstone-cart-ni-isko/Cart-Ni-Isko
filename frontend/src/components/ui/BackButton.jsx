import { useNavigate } from 'react-router-dom'

/**
 * Universal "Back" affordance for every step-by-step process and focused page.
 *
 * System Rule 68: Working "back" or "exit" button wherever necessary.
 * System Rule 69: Back button must be at top left.
 *
 * Supports two variants:
 * - 'button' (default for focused pages): standardized pill/card button with border, subtle shadow, and active press animation.
 * - 'text': inline link-like back affordance with icon.
 */
export default function BackButton({
  to = null,
  onClick = null,
  label = null,
  variant = 'button',
  className = '',
  id,
}) {
  const navigate = useNavigate()
  const goBack = () => {
    if (onClick) return onClick()
    if (to) return navigate(to)
    if (window.history.length > 1) return navigate(-1)
    return navigate('/home')
  }

  // Traditional Arrow icon: stem + arrowhead (left pointing)
  const traditionalArrow = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )

  if (variant === 'text') {
    return (
      <button
        id={id}
        type="button"
        onClick={goBack}
        aria-label={label || 'Back'}
        className={`group inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-[var(--muted)] hover:text-slate-900 dark:hover:text-[var(--ink)] transition-colors duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 rounded-md py-1 px-1.5 -ml-1.5 ${className}`}
      >
        {traditionalArrow}
        {label && <span>{label}</span>}
      </button>
    )
  }

  // Refined modern icon button: borderless, shadowless, subtle background hover, traditional arrow
  return (
    <button
      id={id}
      type="button"
      onClick={goBack}
      aria-label={label || 'Back'}
      className={`group inline-flex items-center gap-1.5 h-9 px-2 rounded-lg bg-transparent hover:bg-slate-100/80 dark:hover:bg-[var(--surface-2)] text-slate-600 dark:text-[var(--ink)] hover:text-slate-900 dark:hover:text-[var(--ink)] active:scale-95 transition-all duration-150 cursor-pointer select-none shrink-0 border-0 shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${className}`}
    >
      {traditionalArrow}
      {label && <span className="text-xs font-semibold tracking-tight whitespace-nowrap">{label}</span>}
    </button>
  )
}
