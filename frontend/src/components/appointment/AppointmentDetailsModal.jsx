import { createPortal } from 'react-dom'
import { CloseIcon } from '../ui/Icons.jsx'
import TrackTimeline from './TrackTimeline.jsx'

const TYPE_LABEL = { CLAIM: 'Order Claiming', VISIT: 'Store Visit' }

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right break-words">{value}</span>
    </div>
  )
}

/** Full details for a single appointment (the "View" action). */
export default function AppointmentDetailsModal({ appointment, onClose, onEdit }) {
  if (!appointment) return null

  return createPortal(
    <div className="fixed inset-0 z-[120000] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 cursor-pointer"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full sm:max-w-md bg-white rounded-lg border border-slate-200 animate-slide-up max-h-[90vh] overflow-y-auto"
      >
        <header className="sticky top-0 bg-white flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900">Appointment #{appointment.id}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center cursor-pointer"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="px-4 py-3 space-y-4">
          <TrackTimeline status={appointment.status} type={appointment.type} />

          <div>
            <Row label="Status" value={appointment.status} />
            <Row label="Type" value={TYPE_LABEL[appointment.type] || appointment.type} />
            <Row label="Date" value={[appointment.date, appointment.dayOfWeek].filter(Boolean).join(', ')} />
            <Row label="Time" value={appointment.time} />
            <Row label="Location" value={`${appointment.location} · ${appointment.subLocation}`} />
            {appointment.orderId && <Row label="Order" value={`#${appointment.orderId}`} />}
            {appointment.qr && <Row label="Reference" value={appointment.qr} />}
            {appointment.desc && <Row label="Details" value={appointment.desc} />}
          </div>

          {appointment.items.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Items ({appointment.itemCount})
              </p>
              <ul className="space-y-1">
                {appointment.items.map((item, index) => (
                  <li key={index} className="text-xs text-slate-700">
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-slate-500"> · {item.details}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex gap-2 px-4 py-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-9 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
          {appointment.status === 'upcoming' && (
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 h-9 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Edit
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  )
}
