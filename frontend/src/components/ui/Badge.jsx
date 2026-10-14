/**
 * A small badge for status indicators and labels.
 * Use this for order statuses, product badges, etc.
 */
export default function Badge({ children, variant = 'brand', className = '' }) {
  const variants = {
    brand: 'bg-orange-50 dark:bg-[var(--tint-brand-bg)] text-brand-orange dark:text-[var(--tint-brand-fg)]',
    ok: 'bg-emerald-50 dark:bg-[var(--tint-ok-bg)] text-emerald-700 dark:text-[var(--tint-ok-fg)]',
    info: 'bg-blue-50 dark:bg-[var(--tint-info-bg)] text-blue-700 dark:text-[var(--tint-info-fg)]',
    warn: 'bg-amber-50 dark:bg-[var(--tint-warn-bg)] text-amber-700 dark:text-[var(--tint-warn-fg)]',
    danger: 'bg-red-50 dark:bg-[var(--tint-danger-bg)] text-red-700 dark:text-[var(--tint-danger-fg)]',
    neutral: 'bg-gray-100 dark:bg-[var(--surface-3)] text-gray-600 dark:text-[var(--muted)]',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
