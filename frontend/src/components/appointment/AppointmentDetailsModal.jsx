import TrackTimeline from './TrackTimeline.jsx'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'

const TYPE_LABEL = { CLAIM: 'Order Claiming', VISIT: 'Store Visit' }

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--line)] last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] shrink-0">{label}</span>
      <span className="text-xs font-semibold text-[var(--ink)] text-right break-words">{value}</span>
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
      subtitle="Scheduled visit or pickup reservation"
      size="wide"
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
                  className="flex-1 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
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
      <div className="modal-scroll space-y-4 pr-0.5">
        <div className="p-3.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] shadow-2xs">
          <TrackTimeline status={appointment.status} type={appointment.type} />
        </div>

        <div className="p-4 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] shadow-2xs">
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
          <div className="p-4 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] shadow-2xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
              Reserved Items ({appointment.itemCount})
            </p>
            <ul className="divide-y divide-[var(--line)]">
              {appointment.items.map((item, index) => (
                <li key={index} className="py-2 text-xs flex items-center justify-between">
                  <span className="font-semibold text-[var(--ink)]">{item.name}</span>
                  <span className="text-[var(--muted)] text-2xs">{item.details}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
