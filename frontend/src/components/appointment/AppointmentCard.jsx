import { Link } from 'react-router-dom'
import { getImageUrl } from '../../utils/imageUtils.js'
import { ShirtIcon } from '../ui/Icons.jsx'
import TrackTimeline from './TrackTimeline.jsx'

const STATUS_STYLE = {
  upcoming: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  done: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  absent: 'bg-amber-50 text-amber-700 border-amber-200',
}

/** "9:00 AM – 9:10 AM" for a 10-minute slot. */
function clockOf(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
  if (!match) return String(value || '')
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`
}

function timeRange(start, end) {
  const first = clockOf(start)
  const second = clockOf(end)
  if (!first) return 'To be confirmed'
  return second ? `${first} – ${second}` : first
}

/** The slot is still cancellable while its end is in the future. */
function endIsFuture(end) {
  const stamp = String(end || '').replace(' ', 'T')
  const moment = new Date(stamp)
  return !Number.isNaN(moment.getTime()) && moment.getTime() > Date.now()
}

/**
 * One row of the Appointments list (DOMAIN 21/22): date, 10-minute
 * time range, status, its QR code (staff scan it, the customer just
 * views it) and the View / Cancel actions. "Cancel" is only offered
 * while appoint_end is still in the future (FLOW-MANAGE_BOOKED-05).
 */
export default function AppointmentCard({ appointment, onView, onCancel }) {
  const { status, items } = appointment
  const canCancel = status === 'upcoming' && endIsFuture(appointment.endISO)

  return (
    <article className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
              STATUS_STYLE[status] || STATUS_STYLE.upcoming
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {status}
          </span>
          <h3 className="mt-1.5 text-sm font-extrabold text-slate-900 truncate">
            Appointment #{appointment.id}
          </h3>
          <p className="text-[11px] text-slate-500 truncate">
            {appointment.orderId
              ? `Order #${appointment.orderId} · ${appointment.itemCount} ${
                  appointment.itemCount === 1 ? 'item' : 'items'
                }`
              : appointment.type === 'PICKUP'
                ? 'Order Pickup'
                : 'Store Visit'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-bold text-slate-900 uppercase leading-tight">
            {appointment.date}
          </p>
          <p className="text-[11px] text-slate-500">{appointment.dayOfWeek}</p>
          <p className="text-[11px] font-semibold text-brand-orange mt-0.5">
            {timeRange(appointment.startISO, appointment.endISO)}
          </p>
        </div>
      </header>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center p-1 shrink-0">
                {item.image ? (
                  <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-contain" />
                ) : (
                  <ShirtIcon className="w-5 h-5 text-brand-orange opacity-40" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900 truncate">{item.name}</span>
                <span className="block text-[11px] text-slate-500">{item.details}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* QR code: the customer views it, staff scan it at the counter */}
      {appointment.qr && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            QR
          </span>
          <code className="text-xs font-mono font-bold text-slate-700 break-all">
            {appointment.qr}
          </code>
          <span className="ml-auto text-[10px] text-slate-400 font-medium">
            Staff scans this at the counter
          </span>
        </div>
      )}

      <TrackTimeline status={status} type={appointment.type} />

      <footer className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={onView}
          className="flex-1 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
        >
          View
        </button>
        {canCancel ? (
          <button
            type="button"
            onClick={() => onCancel?.(appointment)}
            className="flex-1 h-8 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        ) : (
          <span
            aria-disabled="true"
            title={
              status === 'upcoming'
                ? 'This slot can no longer be cancelled.'
                : `${status === 'done' ? 'Completed' : status === 'cancelled' ? 'Cancelled' : 'Marked absent'} appointments cannot be cancelled.`
            }
            className="flex-1 h-8 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold flex items-center justify-center cursor-not-allowed"
          >
            Cancel
          </span>
        )}
        {appointment.orderId && (
          <Link
            to={`/orders/${appointment.orderId}`}
            className="flex-1 h-8 rounded-lg bg-white border border-brand-orange text-brand-orange text-xs font-bold flex items-center justify-center hover:bg-orange-50 transition-colors"
          >
            Order
          </Link>
        )}
      </footer>
    </article>
  )
}
