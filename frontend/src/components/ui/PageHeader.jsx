/**
 * A consistent page header with a back button, title, and optional action.
 * Use this as the header for all inner pages in both portals.
 */
export default function PageHeader({ title, subtitle, backTo, rightAction, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-6 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-lg bg-white dark:bg-[var(--surface)] border border-slate-200 dark:border-[var(--line)] flex items-center justify-center shrink-0 hover:border-brand-orange hover:text-brand-orange transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div className="min-w-0">
          <h1 className="page-title text-gray-900 dark:text-[var(--ink)] truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-[var(--muted)] mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {rightAction && <div className="shrink-0 ml-4">{rightAction}</div>}
    </div>
  )
}
