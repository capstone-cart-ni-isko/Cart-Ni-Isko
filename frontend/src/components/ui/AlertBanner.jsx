/**
 * A dismissible alert banner for important messages.
 * Use this for system-wide notices and warnings.
 */
export default function AlertBanner({ children, variant = 'info', onDismiss, className = '' }) {
  const variants = {
    info: 'bg-blue-50 dark:bg-[var(--tint-info-bg)] border-blue-200 dark:border-[var(--line)] text-blue-800 dark:text-[var(--tint-info-fg)]',
    success: 'bg-emerald-50 dark:bg-[var(--tint-ok-bg)] border-emerald-200 dark:border-[var(--line)] text-emerald-800 dark:text-[var(--tint-ok-fg)]',
    warning: 'bg-amber-50 dark:bg-[var(--tint-warn-bg)] border-amber-200 dark:border-[var(--line)] text-amber-800 dark:text-[var(--tint-warn-fg)]',
    danger: 'bg-red-50 dark:bg-[var(--tint-danger-bg)] border-red-200 dark:border-[var(--line)] text-red-800 dark:text-[var(--tint-danger-fg)]',
  }

  return (
    <div className={`rounded-lg border p-3.5 text-sm font-medium flex items-start gap-2.5 animate-slide-up ${variants[variant]} ${className}`} role="alert">
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer" aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}
