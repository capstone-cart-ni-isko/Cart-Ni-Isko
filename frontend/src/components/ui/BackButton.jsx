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
  label = 'Back',
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

  if (variant === 'text') {
    return (
      <button
        id={id}
        type="button"
        onClick={goBack}
        aria-label={label}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-[var(--muted)] hover:text-brand-orange transition-colors cursor-pointer select-none ${className}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500 dark:text-[var(--muted)]">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>{label}</span>
      </button>
    )
  }

  return (
    <button
      id={id}
      type="button"
      onClick={goBack}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200/90 dark:border-[var(--line)] bg-white dark:bg-[var(--surface)] text-slate-700 dark:text-[var(--ink)] text-xs font-bold hover:bg-slate-50 dark:hover:bg-[var(--surface-3)] hover:text-brand-orange hover:border-brand-orange/40 active:scale-95 transition-all shadow-2xs cursor-pointer select-none shrink-0 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500 dark:text-[var(--muted)]">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label && <span>{label}</span>}
    </button>
  )
}
