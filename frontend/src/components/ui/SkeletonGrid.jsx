import SkeletonCard from './SkeletonCard.jsx'

/**
 * A grid of skeleton placeholder cards matching the catalog layout.
 * Use this while product data is loading to prevent layout shift.
 *
 * @param {number} count - Number of skeleton cards to render (default: 8)
 */
export default function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid-catalog" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
