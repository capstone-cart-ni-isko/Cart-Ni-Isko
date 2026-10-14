/**
 * A button that shows a loading spinner and disables itself while loading.
 * Use this for form submissions and async actions.
 */
export default function LoadingButton({ loading, children, disabled, className = '', ...props }) {
  return (
    <button
      className={`btn btn--primary text-white btn-press cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
          <span>Loading…</span>
        </span>
      ) : children}
    </button>
  )
}
