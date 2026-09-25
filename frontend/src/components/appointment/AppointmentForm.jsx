import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../hooks/useToast.js'
import {
  APPOINT_TYPE,
  createAppointment,
  fetchSlots,
  SLOT_RULES,
  updateAppointment,
} from '../../services/appointments.js'

/**
 * SRS slot geometry (REQ-AB-01 / REQ-AB-02), mirrored from SLOT_RULES for the
 * copy in the heading:
 *   VISIT - 10 minutes, 1 customer per slot   (Appointments page)
 *   CLAIM - 30 minutes, 10 customers per slot (Checkout pickup)
 */
const TYPE_LABEL = { VISIT: 'Store Visit', CLAIM: 'Order Claiming' }

function formatClock(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
  if (!match) return String(value || '')
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`
}

function slotStart(slot) {
  return slot.slot_start ?? slot.start_time ?? slot.start ?? slot.time ?? slot.slot_time ?? ''
}

/** A slot is bookable unless the backend (or the capacity rule) says otherwise. */
function slotOpen(slot) {
  if (slot.available === false || slot.is_available === false) return false
  if (slot.open === false || slot.full === true) return false
  const booked = Number(slot.booked ?? slot.taken ?? slot.reserved ?? slot.used ?? 0)
  const capacity = Number(slot.capacity ?? slot.limit ?? 0)
  return !(capacity > 0 && booked >= capacity)
}

function slotReason(slot) {
  return slot.reason || slot.disabled_reason || 'Fully booked'
}

function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * The one and only appointment booking form (directive 26).
 *
 * Mounted from the standalone Appointments page (Add / Edit) and from Checkout
 * when the customer picks "In-Store Pickup", so both flows book through the
 * same api_appoint endpoints and can never disagree on the slot rules.
 *
 * The appointment type is assigned by the caller and is NOT user-selectable
 * (directive 27): the Appointments page books a VISIT, Checkout books a CLAIM.
 * Rescheduling keeps the appointment's own type, so moving a claim slot can
 * never silently turn an order claim into a 10-minute visit.
 *
 * Props:
 *   type      - 'VISIT' (Appointments page) | 'CLAIM' (Checkout pickup) *   custId    - owning customer (required)
 *   reschedule- existing appointment to edit instead of create
 *   title     - heading override
 *   required  - checkout mode: the form is the slot gate
 *   onSuccess - called with the saved appointment (appoint_id included)
 *   onCancel  - called when the form is dismissed
 */
export default function AppointmentForm({
  type = APPOINT_TYPE.VISIT,
  custId,
  reschedule = null,
  title,
  required = false,
  onSuccess,
  onCancel,
}) {
  const { showToast } = useToast()
  const [date, setDate] = useState(reschedule?.dateISO || '')
  const [details, setDetails] = useState(reschedule?.desc || '')
  const [slots, setSlots] = useState([])
  const [slot, setSlot] = useState('')
  const [slotsError, setSlotsError] = useState('')
  const [booking, setBooking] = useState(false)

  const appointType = reschedule?.type || type
  const rules = SLOT_RULES[appointType] || SLOT_RULES.VISIT

  /** GET /appoint/slots for the picked day. */
  const loadSlots = useCallback(async () => {
    if (!date) {
      setSlots([])
      return
    }
    try {
      const rows = await fetchSlots(date)
      setSlots(Array.isArray(rows) ? rows : [])
      setSlotsError('')
    } catch (err) {
      setSlots([])
      setSlotsError(err?.message || 'Unable to load time slots right now.')
    }
  }, [date])

  // Picking a day resets the selection; while the grid is open it re-polls so a
  // slot flips to "unavailable" the moment it fills up (REQ-SC-04).
  useEffect(() => {
    setSlot('')
    loadSlots()
    if (!date) return undefined
    const timer = setInterval(loadSlots, 5000)
    return () => clearInterval(timer)
  }, [date, loadSlots])

  // Slots arrive as "YYYY-MM-DD HH:MM"; a bare "HH:MM" gets the picked date.
  const slotStamp = /^\d{4}-\d{2}-\d{2} /.test(slot) ? slot : `${date} ${slot}`

  const handleBook = async () => {
    if (booking) return
    if (!custId) {
      showToast('Sign in to book an appointment.', 'error')
      return
    }
    if (!date || !slot) {
      showToast('Please pick a date and a time slot first.', 'error')
      return
    }
    if (!details.trim()) {
      showToast('Please describe the purpose of your appointment.', 'error')
      return
    }

    setBooking(true)
    const payload = {
      appoint_date: slotStamp,
      appoint_type: appointType,
      appoint_desc: details.trim(),
    }

    try {
      // Same api_appoint endpoints in both flows: POST to create,
      // PUT to move an existing booking to a new slot.
      const res = reschedule
        ? await updateAppointment(reschedule.id, payload)
        : await createAppointment({ cust_id: custId, ...payload })
      const saved = {
        ...payload,
        ...(res?.data || {}),
        appoint_id: res?.data?.appoint_id ?? reschedule?.id,
      }
      showToast(reschedule ? 'Appointment rescheduled.' : 'Appointment booked!', 'success')
      setSlot('')
      await loadSlots()
      onSuccess?.(saved)
    } catch (err) {
      showToast(err?.message || 'Unable to book that slot. Try another one.', 'error')
    } finally {
      setBooking(false)
    }
  }

  return (
    <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
      <div>
        <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
          {title || (reschedule ? `Reschedule ${TYPE_LABEL[appointType]}` : `Book a ${TYPE_LABEL[appointType]}`)}
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
          {TYPE_LABEL[appointType]} slots are {rules.minutes} minutes long, up to {rules.capacity}{' '}
          {rules.capacity === 1 ? 'person' : 'people'} per slot.
        </p>
        {reschedule && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-1.5 text-xs font-bold text-brand-orange hover:underline cursor-pointer"
          >
            ← Keep my current slot
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-500">
        <span>Date</span>
        <input
          type="date"
          value={date}
          min={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-gray-700 focus:border-brand-orange"
        />
      </label>

      {slotsError && (
        <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{slotsError}</p>
      )}
      {!date && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
          Pick a date to see the available time slots.
        </p>
      )}
      {date && !slotsError && slots.length === 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
          No slots are open for this date yet. Try another date.
        </p>
      )}

      {slots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((s, index) => {
            const time = slotStart(s)
            const mine = s.mine === true
            const open = !mine && (!s.type || s.type === appointType) && slotOpen(s)
            const active = open && slot === time
            return (
              <button
                key={time || `slot-${index}`}
                type="button"
                disabled={!open}
                title={mine ? 'Your booking' : open ? formatClock(time) : slotReason(s)}
                onClick={() => open && setSlot(time)}
                className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : mine
                    ? 'bg-orange-50 text-brand-orange border-orange-200 cursor-not-allowed'
                    : open
                    ? 'bg-white text-gray-700 border-slate-200 hover:border-brand-orange cursor-pointer'
                    : 'bg-slate-100 text-slate-400 border-slate-100 cursor-not-allowed line-through'
                }`}
              >
                {formatClock(time) || `Slot ${index + 1}`}
                {mine ? (
                  <span className="block text-[10px] font-normal no-underline">Your booking</span>
                ) : !open ? (
                  <span className="block text-[10px] font-normal no-underline">{slotReason(s)}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Appointment details</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder={
            reschedule
              ? 'e.g. Rescheduled claim for order #1234'
              : 'e.g. Claiming order #1234 — BU Varsity Jacket'
          }
          className="w-full mt-1 px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-gray-700 focus:border-brand-orange resize-none"
        />
      </label>

      <button
        type="button"
        disabled={booking || !slot}
        onClick={handleBook}
        className="w-full h-9 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {booking
          ? 'Saving…'
          : slot
          ? `${reschedule ? 'Reschedule' : 'Book'} • ${slotStamp}`
          : 'Select a time slot to book'}
      </button>

      {required && !slot && (
        <p className="text-[11px] text-slate-500 text-center">A time slot is required to continue.</p>
      )}
    </div>
  )
}
