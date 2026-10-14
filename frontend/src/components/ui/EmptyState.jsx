/**
 * A friendly, centered empty state for lists and pages.
 * Use this when a list has no items to display.
 *
 * @param {object} props
 * @param {string} props.title - The main message
 * @param {string} [props.hint] - A secondary explanation
 * @param {React.ReactNode} [props.icon] - An optional icon element
 * @param {React.ReactNode} [props.action] - An optional action button/link
 */
export default function EmptyState({ title, hint, icon, action }) {
  return (
    <div className="text-center py-16 flex flex-col items-center justify-center bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-[var(--line)] p-8 max-w-md mx-auto animate-fade-in">
      {icon && (
        <div className="w-16 h-16 bg-gray-50 dark:bg-[var(--surface-3)] rounded-2xl flex items-center justify-center border border-gray-200 dark:border-[var(--line)] mb-4">
          {icon}
        </div>
      )}
      <h3 className="font-extrabold text-gray-900 dark:text-[var(--ink)] text-lg">{title}</h3>
      {hint && (
        <p className="text-sm text-gray-500 dark:text-[var(--muted)] mt-2 max-w-[280px] mx-auto leading-relaxed">
          {hint}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
