/**
 * A consistent section header with optional action link.
 * Use this for page and section headings across both portals.
 */
export default function SectionHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[var(--ink)] tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 dark:text-[var(--muted)] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
