import { Link } from 'react-router-dom'

/*
  The one card shell every dashboard panel uses: same padding, border, title
  size and action style. The body fills the remaining height and scrolls on
  its own, which is what keeps the page itself from scrolling.
*/
export const ACTION_CLASS =
  'inline-flex items-center gap-1 h-7 px-2 shrink-0 rounded-md text-xs font-medium text-isko-blue hover:text-isko-blue-dark hover:bg-isko-blue/10 transition-colors cursor-pointer'

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
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1 h-4 rounded-full bg-isko-orange shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">{title}</h2>
          {meta && <span className="text-[11px] text-slate-500 truncate min-w-0" title={typeof meta === 'string' ? meta : undefined}>{meta}</span>}
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
