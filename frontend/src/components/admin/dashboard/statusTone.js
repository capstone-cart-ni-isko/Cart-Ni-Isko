/*
  One status palette for the dashboard. Routine states stay neutral so the eye
  is only drawn to what needs a decision: orange for states waiting on staff,
  red for orders that were lost.
*/
const URGENT = ['UNCLAIMED', 'CANCEL REQUESTED', 'RETURN REQUESTED']
const LOST = ['CANCELLED', 'RETURNED', 'REFUNDED']

export const TONE_CLASSES = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  done: 'bg-white text-slate-600 border-slate-200',
  urgent: 'bg-orange-50 text-orange-700 border-orange-200',
  lost: 'bg-rose-50 text-rose-700 border-rose-200',
}

// Solid fills for bars and dots, matching TONE_CLASSES
export const TONE_FILL = {
  neutral: 'bg-slate-500',
  done: 'bg-slate-400',
  urgent: 'bg-orange-500',
  lost: 'bg-rose-500',
}

/** Maps a raw backend status (e.g. 'TO CLAIM') to a tone key. */
export function statusTone(rawStatus) {
  const status = String(rawStatus || '').toUpperCase()
  if (URGENT.includes(status)) return 'urgent'
  if (LOST.includes(status)) return 'lost'
  if (status === 'CLAIMED') return 'done'
  return 'neutral'
}
