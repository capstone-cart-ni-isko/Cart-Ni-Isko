import { useId } from 'react'

/**
 * Shared avatar for both portals. A real photo (`src`) always wins; otherwise
 * one of exactly two scalable default avatars is shown:
 *   - lava: night-black gradient circle, red-orange gradient silhouette
 *   - ice:  aqua-to-royal-blue gradient circle, white silhouette
 * Both are a single vector (viewBox 0..100), so they stay crisp at any `size`
 * (a number of pixels, or any CSS length such as "100%" / "3rem").
 * The variant is stable per person: it follows `userId`, else the name.
 */
const VARIANTS = ['lava', 'ice']

function pickVariant(userId, name) {
  const numeric = Number(userId)
  if (userId != null && userId !== '' && Number.isFinite(numeric)) {
    return VARIANTS[Math.abs(Math.trunc(numeric)) % 2]
  }
  const seed = String(userId ?? name ?? '')
  const sum = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return VARIANTS[sum % 2]
}

// Gender-neutral bust: round head over softly sloped shoulders gracefully resting within circle
const HEAD = { cx: 50, cy: 37, r: 14 }
const SHOULDERS = 'M22 84 C22 66 34 57 50 57 C66 57 78 66 78 84 C78 87 75 90 71 90 L29 90 C25 90 22 87 22 84 Z'

const THEMES = {
  lava: {
    bg: ['#09090b', '#18181b', '#27272a'], // deep rich night black gradient
    fg: ['#ff4500', '#ff8c00', '#ffa500'], // vibrant red-orange to golden orange gradient
    ring: 'rgba(255, 90, 30, 0.45)',
  },
  ice: {
    bg: ['#06b6d4', '#2563eb', '#1d4ed8'], // aquablue to royal blue gradient
    fg: ['#ffffff', '#f8fafc', '#ffffff'], // pristine white silhouette
    ring: 'rgba(255, 255, 255, 0.55)',
  },
}

export default function Avatar({ name = '', src, size = 40, className = '', userId }) {
  const uid = useId().replace(/:/g, '')

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

  const variant = pickVariant(userId, name)
  const t = THEMES[variant]
  const bg = `${uid}-bg`
  const fg = `${uid}-fg`
  const clip = `${uid}-clip`

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={name ? `${name} (default avatar)` : 'Default avatar'}
      className={`rounded-full shrink-0 select-none block overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      data-avatar={variant}
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={t.bg[0]} />
          <stop offset="60%" stopColor={t.bg[1]} />
          <stop offset="100%" stopColor={t.bg[2] || t.bg[1]} />
        </linearGradient>
        <linearGradient id={fg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.fg[0]} />
          <stop offset="65%" stopColor={t.fg[1]} />
          <stop offset="100%" stopColor={t.fg[2] || t.fg[1]} />
        </linearGradient>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="49" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <circle cx="50" cy="50" r="50" fill={`url(#${bg})`} />
        <path d={SHOULDERS} fill={`url(#${fg})`} />
        <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={`url(#${fg})`} />
      </g>
      <circle cx="50" cy="50" r="48.5" fill="none" stroke={t.ring} strokeWidth="2.5" />
    </svg>
  )
}
