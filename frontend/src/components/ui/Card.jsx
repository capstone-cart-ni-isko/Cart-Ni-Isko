/**
 * A consistent card container with hover lift effect.
 * Use this for content cards across both portals.
 */
export default function Card({ children, className = '', hover = true, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-[var(--surface)] rounded-xl border border-slate-200 dark:border-[var(--line)] p-5 transition-all ${hover ? 'card-lift' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}
