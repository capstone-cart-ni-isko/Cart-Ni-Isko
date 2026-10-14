/**
 * A horizontal filter bar with pill-style buttons.
 * Use this for category/status filters across both portals.
 */
export default function FilterBar({ options, activeKey, onChange, className = '' }) {
  return (
    <div className={`flex gap-2 overflow-x-auto py-2 scrollbar-none select-none ${className}`} role="tablist">
      {options.map((opt) => {
        const isActive = activeKey === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={isActive}
            className={`px-4 py-2 rounded-full text-xs font-bold shrink-0 transition-all border cursor-pointer ${
              isActive
                ? 'bg-brand-orange border-brand-orange text-white shadow-sm'
                : 'bg-white dark:bg-[var(--surface)] border-gray-200 dark:border-[var(--line)] text-gray-600 dark:text-[var(--muted)] hover:border-gray-300 dark:hover:border-[var(--line-2)] hover:text-gray-900 dark:hover:text-[var(--ink)]'
            }`}
          >
            {opt.label}
            {opt.count != null && (
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${isActive ? 'bg-white/25 text-white' : 'bg-gray-100 dark:bg-[var(--surface-3)] text-gray-500 dark:text-[var(--muted)]'}`}>
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
