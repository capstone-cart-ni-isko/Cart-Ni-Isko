/**
 * A reusable search input with a magnifying glass icon and clear button.
 * Use this for all search fields across both portals for consistency.
 */
export default function SearchInput({
  value,
  onChange,
  onClear,
  onFocus,
  onBlur,
  onKeyDown,
  placeholder = 'Search…',
  className = '',
  size = 'md',
  autoFocus = false,
  inputRef = null,
  id = null,
}) {
  const heights = { sm: 'h-9 text-xs', md: 'h-10 text-sm', lg: 'h-11 text-base' }
  const hasValue = Boolean(value && String(value).length > 0)

  const handleClear = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (onClear) onClear()
    else if (onChange) onChange('')
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 dark:text-[var(--muted-2)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none shrink-0">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`w-full ${heights[size] || heights.md} pl-9 ${hasValue ? 'pr-9' : 'pr-3'} rounded-xl bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-sm text-slate-900 dark:text-[var(--ink)] placeholder-gray-400 dark:placeholder-[var(--muted-2)] focus:outline-none focus:border-brand-orange focus:bg-white dark:focus:bg-[var(--surface)] transition-all`}
      />
      {hasValue && (
        <button
          type="button"
          tabIndex={-1}
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}
