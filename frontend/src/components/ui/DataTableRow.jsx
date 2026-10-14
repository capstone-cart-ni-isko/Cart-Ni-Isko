/**
 * A simple table row component for consistent data table styling.
 * Use this within DataTable components across both portals.
 */
export default function DataTableRow({ children, onClick, className = '' }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-slate-100 dark:border-[var(--line)] transition-colors ${onClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-[var(--surface-3)]' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}
