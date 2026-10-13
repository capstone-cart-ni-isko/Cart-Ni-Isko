import TrackTimeline from './TrackTimeline.jsx'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'

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
export default function AppointmentDetailsModal({ appointment, onClose, onEdit, onCancel }) {
  if (!appointment) return null

  return (
    <Modal
      isOpen={!!appointment}
      onClose={onClose}
      title={`Appointment #${appointment.id}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Close
          </Button>
          {appointment.status === 'upcoming' && (
            <>
              {onCancel && (
                <Button
                  variant="ghost"
                  onClick={() => onCancel(appointment)}
                  className="flex-1 border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Cancel
                </Button>
              )}
              <Button variant="primary" onClick={onEdit} className="flex-1">
                Edit
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="modal-scroll space-y-4">
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
    </Modal>
  )
}
