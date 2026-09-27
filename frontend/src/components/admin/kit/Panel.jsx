import { Link } from 'react-router-dom'

/*
  Admin kit card shell, shared by the dashboard, Orders, Schedule, Pickup,
  Storefront and Analytics: same padding, border, title size and action style.

  Page shell pattern (≥1024px wide, no page scroll):
    root   <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
    header <AdminPageHeader />            (shrink-0)
    kpis   <div className="grid … shrink-0">
    body   <div className="grid … lg:flex-1 lg:min-h-0">  Panels here
  Panel bodies fill the remaining height; lists inside them scroll on their
  own (add SCROLL_FADE from ui.js), so the page itself never scrolls. Below
  1024px everything stacks and the page scrolls normally.
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

export default function Panel({
  title,
  meta,
  actionLabel,
  actionTo,
  onAction,
  actions, // custom header controls (toggles, buttons), rendered on the right
  children,
  className = '',
  bodyClassName = '',
}) {
  const hasHeader = title || actions || actionLabel
  return (
    <section className={`bg-white border border-slate-200 rounded-lg p-3 flex flex-col min-h-0 ${className}`}>
      {hasHeader && (
        <header className="min-h-8 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <>
                <span className="w-1 h-4 rounded-full bg-isko-orange shrink-0" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">{title}</h2>
              </>
            )}
            {meta && (
              <span className="text-[11px] text-slate-500 truncate min-w-0" title={typeof meta === 'string' ? meta : undefined}>
                {meta}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
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
          </div>
        </header>
      )}
      <div className={`flex-1 min-h-0 ${hasHeader ? 'mt-2' : ''} ${bodyClassName}`}>{children}</div>
    </section>
  )
}
