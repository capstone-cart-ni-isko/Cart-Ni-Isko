/**
 * A star rating display component.
 * Use this for product reviews and ratings.
 */
export default function RatingStars({ rating = 0, max = 5, size = 'sm', showValue = true }) {
  const sizes = { sm: 'w-3.5 h-3.5', md: 'w-4.5 h-4.5', lg: 'w-5 h-5' }
  const stars = Array.from({ length: max }, (_, i) => i < Math.round(rating))
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of ${max}`}>
      {stars.map((filled, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`${sizes[size]} ${filled ? 'text-amber-400' : 'text-gray-200 dark:text-[var(--surface-4)]'}`}
          fill="currentColor"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
      {showValue && <span className="ml-1 text-xs font-bold text-gray-600 dark:text-[var(--muted)]">{rating.toFixed(1)}</span>}
    </div>
  )
}
