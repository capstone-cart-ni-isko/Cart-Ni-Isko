/**
 * Visual fulfillment progress for a single appointment.
 *
 * The SRS stores no appointment status column, so progress is derived from
 * appoint_closed plus the slot's own clock: an open booking that has not
 * elapsed is "confirmed", a closed one is "done", and a booking that elapsed
 * without being closed is "cancelled".
 */
const STEPS = [
  { key: 'booked', label: 'Booked' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'store', label: 'In store' },
  { key: 'done', label: 'Completed' },
]

const DONE_INDEX = { upcoming: 1, done: 3, cancelled: 0 }

export default function TrackTimeline({ status = 'upcoming', type = 'VISIT' }) {
  const isCancelled = status === 'cancelled'
  const activeIndex = DONE_INDEX[status] ?? 1
  const steps = type === 'VISIT' ? STEPS.map((s) => (s.key === 'store' ? { ...s, label: 'Visited' } : s)) : STEPS

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Track</p>

      {isCancelled ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-bold text-red-700">Cancelled</p>
          <p className="text-[11px] text-red-600 leading-snug">
            This slot is no longer active. Book a new one to reschedule.
          </p>
        </div>
      ) : (
        <ol className="flex items-start">
          {steps.map((step, index) => {
            const done = index <= activeIndex
            const isLast = index === steps.length - 1
            return (
              <li key={step.key} className="flex-1 min-w-0 last:flex-none">
                <div className="flex items-center">
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      done ? 'bg-brand-orange border-brand-orange' : 'bg-white border-slate-300'
                    }`}
                  >
                    {done && (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-2 h-2"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  {!isLast && (
                    <span
                      className={`h-0.5 flex-1 mx-1 ${index < activeIndex ? 'bg-brand-orange' : 'bg-slate-200'}`}
                    />
                  )}
                </div>
                <p
                  className={`mt-1 text-[10px] leading-tight pr-1 ${
                    index === activeIndex
                      ? 'text-brand-orange font-extrabold'
                      : done
                      ? 'text-slate-600 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
