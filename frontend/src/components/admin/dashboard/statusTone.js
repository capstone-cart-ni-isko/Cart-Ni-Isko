/*
  One status palette for the dashboard, built on the Cart ni Isko scheme:
  - active (in progress): brand blue tint
  - done (claimed): quiet neutral with a green dot
  - urgent (waiting on staff): brand orange tint
  - lost (cancelled / returned / refunded): red
  Everything else stays neutral so colour always carries meaning.
*/
const ACTIVE = ['TO PROCESS', 'TO CLAIM', 'TO RECEIVE']
const URGENT = ['UNCLAIMED', 'CANCEL REQUESTED', 'RETURN REQUESTED']
const LOST = ['CANCELLED', 'RETURNED', 'REFUNDED']

export const TONE_CLASSES = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  active: 'bg-isko-blue/10 text-isko-blue-dark border-isko-blue/25',
  done: 'bg-white text-slate-600 border-slate-200',
  urgent: 'bg-isko-orange/10 text-isko-orange-dark border-isko-orange/30',
  lost: 'bg-rose-50 text-rose-700 border-rose-200',
}

// Solid fills for bars and dots, matching TONE_CLASSES
export const TONE_FILL = {
  neutral: 'bg-slate-400',
  active: 'bg-isko-blue',
  done: 'bg-isko-blue/40',
  urgent: 'bg-isko-orange',
  lost: 'bg-rose-500',
}

/** Maps a raw backend status (e.g. 'TO CLAIM') to a tone key. */
export function statusTone(rawStatus) {
  const status = String(rawStatus || '').toUpperCase()
  if (ACTIVE.includes(status)) return 'active'
  if (URGENT.includes(status)) return 'urgent'
  if (LOST.includes(status)) return 'lost'
  if (status === 'CLAIMED') return 'done'
  return 'neutral'
}
