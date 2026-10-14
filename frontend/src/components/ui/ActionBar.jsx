/**
 * A sticky action bar for mobile that sits above the bottom navigation.
 * Use this for primary actions like "Add to Cart" or "Checkout".
 */
export default function ActionBar({ children, className = '' }) {
  return (
    <div className={`lg:hidden fixed left-0 right-0 z-40 bg-white dark:bg-[var(--surface)] border-t border-slate-200 dark:border-[var(--line)] px-4 py-3 safe-bottom ${className}`}>
      <div className="mx-auto max-w-lg flex items-center gap-3">{children}</div>
    </div>
  )
}
