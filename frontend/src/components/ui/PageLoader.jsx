/**
 * A centered page-level loading spinner with an accessible label.
 * Use this for full-page loading states (e.g., initial data fetch).
 */
export default function PageLoader({ label = 'Loading…', size = 32 }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center gap-3" role="status" aria-live="polite">
      <span
        className="spinner-circle"
        style={{ '--spinner-size': `${size}px` }}
        aria-hidden="true"
      />
      <p className="text-sm font-semibold text-gray-500 dark:text-[var(--muted)]">{label}</p>
    </div>
  )
}
