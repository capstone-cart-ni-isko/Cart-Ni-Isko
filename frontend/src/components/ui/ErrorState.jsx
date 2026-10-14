/**
 * A friendly, centered error state with a retry action.
 * Use this when data fails to load.
 *
 * @param {object} props
 * @param {string} [props.title] - The main error message
 * @param {string} [props.hint] - A secondary explanation
 * @param {function} [props.onRetry] - Callback when the retry button is clicked
 */
export default function ErrorState({ title = 'Something went wrong', hint, onRetry }) {
  return (
    <div className="text-center py-16 flex flex-col items-center justify-center bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-[var(--line)] p-8 max-w-md mx-auto animate-fade-in">
      <div className="w-16 h-16 bg-red-50 dark:bg-[var(--tint-danger-bg)] rounded-2xl flex items-center justify-center border border-red-100 dark:border-[var(--line)] mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-red-500">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h3 className="font-extrabold text-gray-900 dark:text-[var(--ink)] text-lg">{title}</h3>
      {hint && (
        <p className="text-sm text-gray-500 dark:text-[var(--muted)] mt-2 max-w-[280px] mx-auto leading-relaxed">
          {hint}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 px-5 py-2.5 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-sm transition-colors cursor-pointer"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
