import { useEffect, useState } from 'react'

/* Current date (and optionally time), refreshed so an admin tab left open
   overnight or for hours never shows a stale day or clock. */
export default function LiveDate({ withTime = false, className = '' }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const date = now.toLocaleDateString('en-US', {
    weekday: withTime ? 'short' : undefined,
    month: withTime ? 'short' : 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return <span className={className}>{withTime ? `${date} · ${time}` : date}</span>
}
