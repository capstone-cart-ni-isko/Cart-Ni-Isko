/**
 * An icon-only button with a tooltip.
 * Use this for compact icon actions in both portals.
 */
export default function IconButton({ label, onClick, children, variant = 'default', size = 'md', disabled = false, className = '' }) {
  const variants = {
    default: 'text-gray-500 dark:text-[var(--muted)] hover:bg-slate-100 dark:hover:bg-[var(--surface-3)] hover:text-gray-700 dark:hover:text-[var(--ink)]',
    primary: 'text-brand-orange hover:bg-orange-50 dark:hover:bg-[var(--tint-brand-bg)]',
    danger: 'text-red-500 hover:bg-red-50 dark:hover:bg-[var(--tint-danger-bg)]',
  }
  const sizes = { sm: 'w-7 h-7', md: 'w-9 h-9', lg: 'w-10 h-10' }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-lg flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}
