/**
 * A reusable search input with a magnifying glass icon.
 * Use this for all search fields across both portals for consistency.
 */
export default function SearchInput({ value, onChange, placeholder = 'Search…', className = '', size = 'md' }) {
  const heights = { sm: 'h-9 text-xs', md: 'h-10 text-sm', lg: 'h-11 text-base' }
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 dark:text-[var(--muted-2)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`w-full ${heights[size] || heights.md} pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-sm text-slate-900 dark:text-[var(--ink)] placeholder-gray-400 dark:placeholder-[var(--muted-2)] focus:outline-none focus:border-brand-orange focus:bg-white dark:focus:bg-[var(--surface)] transition-all`}
      />
    </div>
  )
}
