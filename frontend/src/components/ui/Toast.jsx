/**
 * A toast notification component for transient messages.
 * Use this for success, error, and info notifications.
 */
export default function Toast({ message, type = 'info', onClose }) {
  if (!message) return null

  const types = {
    info: 'bg-white dark:bg-[var(--surface)] border-slate-200 dark:border-[var(--line)] text-gray-800 dark:text-[var(--ink)]',
    success: 'bg-emerald-50 dark:bg-[var(--tint-ok-bg)] border-emerald-200 dark:border-[var(--line)] text-emerald-800 dark:text-[var(--tint-ok-fg)]',
    error: 'bg-red-50 dark:bg-[var(--tint-danger-bg)] border-red-200 dark:border-[var(--line)] text-red-800 dark:text-[var(--tint-danger-fg)]',
  }

  const icons = {
    info: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    success: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    error: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  }

  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium animate-slide-up ${types[type]}`} role="alert">
      {icons[type]}
      <span className="flex-1">{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer" aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}
