import { Link } from 'react-router-dom'
import { getImageUrl } from '../../utils/imageUtils.js'
import { appointmentStatusLabel } from '../../services/appointments.js'
import { parseDate } from '../../services/dashboard.js'
import { ShirtIcon } from '../ui/Icons.jsx'
import TrackTimeline from './TrackTimeline.jsx'

const STATUS_STYLE = {
  upcoming: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  done: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  absent: 'bg-amber-50 text-amber-700 border-amber-200',
}

/** The slot is still cancellable while its end is in the future. */
function endIsFuture(end) {
  const moment = parseDate(end)
  return Boolean(moment && moment.getTime() > Date.now())
}

/**
 * One row of the Appointments list (DOMAIN 21/22): date, 10-minute
 * time range, status, its QR code (staff scan it, the customer just
 * views it) and the View / Cancel actions. "Cancel" is only offered
 * while appoint_end is still in the future (FLOW-MANAGE_BOOKED-05).
 */
export default function AppointmentCard({ appointment, onView, onCancel, onShowQr }) {
  const { status, items } = appointment
  const canCancel = status === 'upcoming' && endIsFuture(appointment.endISO)
  const displayStatus = appointmentStatusLabel(status)

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs p-5 md:p-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
              STATUS_STYLE[status] || STATUS_STYLE.upcoming
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {displayStatus}
          </span>
          <h3 className="mt-2 text-base md:text-lg font-semibold text-slate-900 truncate">
            Appointment #{appointment.id}
          </h3>
          <p className="text-sm text-slate-500 truncate">
            {appointment.orderId
              ? `Order #${appointment.orderId} · ${appointment.itemCount} ${
                  appointment.itemCount === 1 ? 'item' : 'items'
                }`
              : appointment.type === 'CLAIM' || appointment.type === 'PICKUP'
                ? 'Order Pickup'
                : 'Store Visit'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-slate-900 uppercase leading-tight">
            {appointment.date}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">{appointment.dayOfWeek}</p>
          <p className="text-sm font-semibold text-brand-orange mt-1">
            {appointment.time || 'To be confirmed'}
          </p>
        </div>
      </header>

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center p-1 shrink-0">
                {item.image ? (
                  <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-contain" />
                ) : (
                  <ShirtIcon className="w-5 h-5 text-brand-orange opacity-40" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 truncate">{item.name}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{item.details}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* QR code: the customer views it, staff scan it at the counter */}
      {appointment.qr && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            QR
          </span>
          <span className="text-sm font-semibold text-slate-700">Claim pass ready</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-slate-400 font-medium">
              Staff scans this at the counter
            </span>
            <button
              type="button"
              onClick={() => onShowQr?.(appointment)}
              className="h-9 px-4 rounded-full bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Show QR
            </button>
          </span>
        </div>
      )}

      {/* The store marked the order ready: the customer presents the QR. */}
      {appointment.qr && appointment.ordStatus === 'to claim' && (
        <button
          type="button"
          onClick={() => onShowQr?.(appointment)}
          className="w-full text-left rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 hover:bg-emerald-100 transition-colors cursor-pointer"
        >
          <span className="block text-sm font-semibold text-emerald-800">
            Ready to claim{appointment.orderId ? ` · Order #${appointment.orderId}` : ''}
          </span>
          <span className="block text-xs text-emerald-700 mt-0.5">
            Show your QR code at the counter and the staff will scan it. Tap to open it.
          </span>
        </button>
      )}

      <TrackTimeline status={status} type={appointment.type} />

      <footer className="flex items-center gap-2.5 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onView}
          className="flex-1 h-10 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
        >
          View
        </button>
        {canCancel ? (
          <button
            type="button"
            onClick={() => onCancel?.(appointment)}
            className="flex-1 h-10 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        ) : (
          <span
            aria-disabled="true"
            title={
              status === 'upcoming'
                ? 'This slot can no longer be cancelled.'
                : `${status === 'done' ? 'Completed' : status === 'cancelled' ? 'Cancelled' : 'No-show'} appointments cannot be cancelled.`
            }
            className="flex-1 h-10 rounded-xl bg-slate-100 text-slate-400 text-sm font-semibold flex items-center justify-center cursor-not-allowed"
          >
            Cancel
          </span>
        )}
        {appointment.orderId && (
          <Link
            to={`/orders/${appointment.orderId}`}
            className="flex-1 h-10 rounded-xl bg-white border border-brand-orange text-brand-orange text-sm font-semibold flex items-center justify-center hover:bg-orange-50 transition-colors"
          >
            Order
          </Link>
        )}
      </footer>
    </article>
  )
}
