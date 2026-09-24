/**
 * Orange progress ring — the standard loading indicator for async states.
 * Replace any "loading..." text with <LoadingSpinner /> for instant visual feedback.
 */
export default function LoadingSpinner({ size = 32, className = '' }) {
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 50 50"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-spin"
        aria-hidden="true"
      >
        {/* Light track keeps the ring shape while the arc sweeps. */}
        <circle cx="25" cy="25" r="20" fill="none" stroke="#FED7AA" strokeWidth="5" />
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="#F97316"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="31.4 94.3"
        />
      </svg>
    </div>
  )
}
