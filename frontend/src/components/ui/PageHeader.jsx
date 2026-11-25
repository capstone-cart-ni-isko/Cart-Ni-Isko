import BackButton from './BackButton.jsx'

/**
 * A consistent page header with a back button, title, and optional action.
 * Use this as the header for all inner pages in both portals.
 *
 * Mobile: the pages that use it (bag, notifications, appointments) sit in a
 * shell with no top padding of its own, so the header carries the breathing
 * room - the device safe area (notch / status bar in the installed PWA) plus
 * a fixed gap - instead of pinning the title to the very top edge.
 *
 * Back (rules 68/69): same control and behaviour as FocusedLayout - it steps
 * back through in-app history, and when the page was opened directly (fresh
 * tab, PWA launch, notification link) it goes to `backTo` instead of leaving
 * the app.
 */
export default function PageHeader({ title, subtitle, backTo, rightAction, className = '' }) {
  return (
    <div className={`safe-top ${className}`}>
      <div className="flex items-center justify-between gap-3 pt-5 pb-1 mb-1 md:pt-0 md:pb-0 md:mb-6">
        <div className="flex items-center gap-2 min-w-0">
          {backTo && (
            <BackButton className="-ml-2" fallbackTo={backTo} />
          )}
          <div className="min-w-0">
            <h1 className="page-title text-gray-900 dark:text-[var(--ink)] truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs md:text-sm text-gray-500 dark:text-[var(--muted)] mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {rightAction && <div className="shrink-0">{rightAction}</div>}
      </div>
    </div>
  )
}
