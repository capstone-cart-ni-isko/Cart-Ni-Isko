/**
 * Default avatar.
 *
 * Odd cust_id  → aqua-blue background with a white head silhouette.
 * Even cust_id → dark-grey background with a fiery red-orange head silhouette.
 * No userId   → brand-blue/orange fallback.
 */
export default function Avatar({ name = '', src, size = 40, className = '', userId }) {
  if (src && !src.includes('avatar.png') && !src.includes('placeholder') && !src.includes('icons')) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  const isOdd = userId != null ? Number(userId) % 2 !== 0 : null
  const background = isOdd === true ? '#00B4D8' : isOdd === false ? '#2D2D2D' : '#2563EB'
  const headColor = isOdd === true ? '#FFFFFF' : '#F97316'

  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label={name || 'Avatar'}
      className={`shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="20" fill={background} />
      <g fill={headColor}>
        <circle cx="20" cy="14" r="7" />
        <path d="M8 36 C8 29 13 24 20 24 C27 24 32 29 32 36 A20 20 0 0 1 8 36 Z" />
      </g>
    </svg>
  )
}
