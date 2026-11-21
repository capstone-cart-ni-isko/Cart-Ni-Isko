/**
 * A polling timer that only runs while the tab is visible.
 *
 * Live updates (Pusher) refresh screens the moment data changes, so the
 * timers are only a safety net. A hidden tab never polls; when the tab is
 * shown again it refreshes once straight away, then keeps the slow pace.
 * Returns a cleanup function, like the effect it is used in expects.
 */
export function setVisibleInterval(fn, ms) {
  const tick = () => {
    if (!document.hidden) fn()
  }
  const id = setInterval(tick, ms)
  const onVisibility = () => {
    if (!document.hidden) fn()
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/** Safety-net pace for screens that also receive live updates. */
export const BACKUP_POLL_MS = 120000
