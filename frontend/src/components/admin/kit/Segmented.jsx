/*
  Blue segmented control used for range toggles, tabs and filter pills.
  options: [{ value, label, count? }] or plain strings.
*/
export default function Segmented({ options = [], value, onChange, label, size = 'md', className = '' }) {
  const items = options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))
  const height = size === 'sm' ? 'h-7' : 'h-8'
  const inner = size === 'sm' ? 'h-6 px-2.5 text-[11px]' : 'h-7 px-3 text-xs'

  return (
    <div className={`inline-flex ${height} p-0.5 bg-slate-100 rounded-md max-w-full overflow-x-auto ${className}`} role="radiogroup" aria-label={label}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange?.(item.value)}
            className={`${inner} shrink-0 inline-flex items-center gap-1.5 rounded font-semibold whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange ${
              active ? 'bg-isko-blue text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                className={`min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-center tabular-nums ${
                  active ? 'bg-white/25 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
