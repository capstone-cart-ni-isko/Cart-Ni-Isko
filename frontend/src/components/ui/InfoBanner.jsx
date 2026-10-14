/**
 * A non-dismissible informational banner for notices and tips.
 * Use this for inline informational messages.
 */
export default function InfoBanner({ children, variant = 'info', className = '' }) {
  const variants = {
    info: 'bg-blue-50 dark:bg-[var(--tint-info-bg)] border-blue-200 dark:border-[var(--line)] text-blue-800 dark:text-[var(--tint-info-fg)]',
    success: 'bg-emerald-50 dark:bg-[var(--tint-ok-bg)] border-emerald-200 dark:border-[var(--line)] text-emerald-800 dark:text-[var(--tint-ok-fg)]',
    warning: 'bg-amber-50 dark:bg-[var(--tint-warn-bg)] border-amber-200 dark:border-[var(--line)] text-amber-800 dark:text-[var(--tint-warn-fg)]',
    danger: 'bg-red-50 dark:bg-[var(--tint-danger-bg)] border-red-200 dark:border-[var(--line)] text-red-800 dark:text-[var(--tint-danger-fg)]',
  }
  return (
    <div className={`rounded-lg border p-3.5 text-sm font-medium flex items-start gap-2.5 ${variants[variant]} ${className}`} role="alert">
      {children}
    </div>
  )
}
