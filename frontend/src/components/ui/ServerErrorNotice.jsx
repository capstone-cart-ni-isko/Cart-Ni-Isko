import Button from './Button.jsx'

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
      <p className="text-sm font-semibold text-gray-900">We couldn't load the store</p>
      <p className="text-xs text-gray-500 max-w-xs">{message}</p>
      {onRetry && (
        <Button type="button" variant="primary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
