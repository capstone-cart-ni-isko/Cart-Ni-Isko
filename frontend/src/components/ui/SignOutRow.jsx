import { LogOutIcon } from './Icons.jsx'

/**
 * The one sign-out control for both portals' profile pages: a full-width
 * card-shaped row in the danger tone. It only asks; the caller opens its
 * confirmation dialog (FLOW-CUST_LOGOUT-01 / FLOW-EMP_LOGOUT-02).
 */
export default function SignOutRow({ onClick, label = 'Log Out', hint = '', className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 text-left bg-white dark:bg-[var(--surface)] rounded-2xl border border-slate-200/80 dark:border-[var(--line)] shadow-2xs p-4 md:p-5 hover:bg-red-50 hover:border-red-200 active:bg-red-100 dark:hover:bg-[var(--tint-danger-bg)] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 ${className}`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <LogOutIcon className="w-5 h-5 text-red-500 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-red-600">{label}</span>
          {hint && <span className="block text-xs text-slate-500 dark:text-[var(--muted)] mt-0.5">{hint}</span>}
        </span>
      </span>
      <span className="text-red-300 text-xl font-medium leading-none" aria-hidden="true">›</span>
    </button>
  )
}
