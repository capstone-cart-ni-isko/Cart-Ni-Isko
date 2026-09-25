/** Shown instead of content when the API can't be reached, with a Retry action. */
export default function ServerErrorNotice({
  message = "Can't reach the store server. Please try again.",
  onRetry,
  className = '',
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center gap-3 py-12 px-4 ${className}`}
    >
      <p className="text-sm font-bold text-gray-900">We couldn't load the store</p>
      <p className="text-xs text-gray-500 max-w-xs">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold transition-colors cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  )
}
