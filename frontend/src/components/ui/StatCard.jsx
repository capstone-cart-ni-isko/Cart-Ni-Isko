/**
 * A simple stat card for displaying key metrics.
 * Use this in dashboards and summary panels.
 */
export default function StatCard({ label, value, subtext, icon, accent = 'orange', onClick, hint }) {
  const accents = {
    orange: 'text-brand-orange',
    blue: 'text-isko-blue',
    green: 'text-emerald-600',
    red: 'text-red-500',
  }
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-[var(--surface)] rounded-xl border border-slate-200 dark:border-[var(--line)] p-4 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300 dark:hover:border-[var(--line-2)]' : ''}`}
      title={hint}
      role={onClick ? 'button' : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-[var(--muted)] uppercase tracking-wider">{label}</span>
        {icon && <span className={accents[accent] || accents.orange}>{icon}</span>}
      </div>
      <p className="text-2xl font-semibold text-gray-900 dark:text-[var(--ink)]">{value}</p>
      {subtext && <p className="text-xs text-gray-400 dark:text-[var(--muted-2)] mt-1">{subtext}</p>}
    </div>
  )
}
