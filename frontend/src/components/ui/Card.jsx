/**
 * The shared content card for both portals (profile sections, settings
 * blocks, detail panels).
 *
 * One radius, border, shadow and padding everywhere. An optional heading row
 * carries a `title`, a `subtitle` and an `action` (an edit link, a small
 * button) on the right, so section headers line up the same on every page.
 *
 * `hover` adds the lift effect - only for cards that are themselves clickable.
 */
export default function Card({
  children,
  title,
  subtitle,
  action,
  as: Tag = 'section',
  className = '',
  hover = false,
  onClick,
}) {
  const hasHeader = title || action
  return (
    <Tag
      onClick={onClick}
      className={`bg-white dark:bg-[var(--surface)] rounded-2xl border border-slate-200/80 dark:border-[var(--line)] shadow-2xs p-4 md:p-5 transition-all ${hover ? 'card-lift' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {hasHeader && (
        <div className={`flex items-start justify-between gap-3 ${children ? 'mb-3' : ''}`}>
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-slate-900 dark:text-[var(--ink)]">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-[var(--muted)] mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}
