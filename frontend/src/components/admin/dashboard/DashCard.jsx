import { Link } from 'react-router-dom'

/*
  The one card shell every dashboard panel uses: same padding, border, title
  size and action style. The body fills the remaining height and scrolls on
  its own, which is what keeps the page itself from scrolling.
*/
export const ACTION_CLASS =
  'inline-flex items-center gap-1 h-7 px-2 -mr-2 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer'

export function Chevron({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function DashCard({ title, meta, actionLabel, actionTo, onAction, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg p-3 flex flex-col min-h-0 ${className}`}>
      <header className="h-8 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">{title}</h2>
          {meta && <span className="text-[11px] text-slate-500 truncate">{meta}</span>}
        </div>
        {actionLabel && actionTo && (
          <Link to={actionTo} className={ACTION_CLASS}>
            {actionLabel}
            <Chevron />
          </Link>
        )}
        {actionLabel && !actionTo && onAction && (
          <button type="button" onClick={onAction} className={ACTION_CLASS}>
            {actionLabel}
            <Chevron />
          </button>
        )}
      </header>
      <div className={`flex-1 min-h-0 mt-2 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
