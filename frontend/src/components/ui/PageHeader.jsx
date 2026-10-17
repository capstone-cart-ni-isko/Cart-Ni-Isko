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
            className="group w-9 h-9 rounded-full bg-transparent hover:bg-slate-100/80 dark:hover:bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-slate-600 hover:text-slate-900 dark:text-[var(--muted)] dark:hover:text-[var(--ink)] active:scale-95 transition-all duration-150 border-0 shadow-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
            aria-label="Back"
          >
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
