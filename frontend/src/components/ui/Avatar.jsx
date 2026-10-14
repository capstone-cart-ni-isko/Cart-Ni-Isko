/**
 * A consistent avatar component with fallback initials.
 * Use this for user profiles across both portals.
 */
export default function Avatar({ name = '', src, size = 40, className = '' }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const colors = [
    'bg-orange-100 text-brand-orange',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-amber-100 text-amber-700',
  ]
  const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${colors[colorIndex]} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={name}
    >
      {initials || '?'}
    </span>
  )
}
