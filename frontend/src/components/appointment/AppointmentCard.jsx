import { Link } from 'react-router-dom'
import { getImageUrl } from '../../utils/imageUtils.js'
import { ShirtIcon } from '../ui/Icons.jsx'
import TrackTimeline from './TrackTimeline.jsx'

const STATUS_STYLE = {
  upcoming: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  done: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}

/**
 * One row of the Appointments list: date, time, status, fulfillment track and
 * the View / Edit actions. "Edit" only exists while the booking is still live -
 * a Done or Cancelled appointment can no longer be moved (the api_appoint
 * endpoint rejects it too).
 */
export default function AppointmentCard({ appointment, onView, onEdit }) {
  const { status, items } = appointment
  const canEdit = status === 'upcoming'

  return (
    <article className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
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
              : appointment.type === 'CLAIM'
              ? 'Order Claiming'
              : 'Store Visit'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-bold text-slate-900 uppercase leading-tight">{appointment.date}</p>
          <p className="text-[11px] text-slate-500">{appointment.dayOfWeek}</p>
          <p className="text-[11px] font-semibold text-brand-orange mt-0.5">{appointment.time}</p>
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

      <TrackTimeline status={status} type={appointment.type} />

      <footer className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={onView}
          className="flex-1 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
        >
          View
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 h-8 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Edit
          </button>
        ) : (
          <span
            aria-disabled="true"
            title={
              status === 'done'
                ? 'Completed appointments can no longer be edited.'
                : 'Cancelled appointments cannot be edited.'
            }
            className="flex-1 h-8 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold flex items-center justify-center cursor-not-allowed"
          >
            Edit
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
