/**
 * A vertical timeline component for order history and activity feeds.
 * Use this for order status history, notification timelines, etc.
 */
export default function Timeline({ items }) {
  return (
    <div className="relative">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className={`w-3 h-3 rounded-full shrink-0 ${item.active ? 'bg-brand-orange' : 'bg-gray-200 dark:bg-[var(--surface-4)]'}`} />
            {idx < items.length - 1 && <span className="w-0.5 flex-1 bg-gray-200 dark:bg-[var(--surface-4)]" />}
          </div>
          <div className="min-w-0 pb-2">
            <p className={`text-sm font-semibold ${item.active ? 'text-gray-900 dark:text-[var(--ink)]' : 'text-gray-500 dark:text-[var(--muted)]'}`}>
              {item.title}
            </p>
            {item.subtitle && <p className="text-xs text-gray-400 dark:text-[var(--muted-2)] mt-0.5">{item.subtitle}</p>}
            {item.time && <p className="text-[11px] text-gray-400 dark:text-[var(--muted-2)] mt-1">{item.time}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
