import { useState } from 'react'
import { useToast } from '../../hooks/useToast.js'
import {
  APPOINT_TYPE,
  createAppointment,
  SLOT_RULES,
  updateAppointment,
} from '../../services/appointments.js'
import SlotPicker, { slotTimeLabel } from '../ui/SlotPicker.jsx'

/**
 * SRS slot geometry (REQ-AB-01 / REQ-AB-02), mirrored from SLOT_RULES for the
 * copy in the heading:
 *   VISIT - 10 minutes, 1 customer per slot   (Appointments page)
 *   CLAIM - 30 minutes, 10 customers per slot (Checkout pickup)
 */
const TYPE_LABEL = { VISIT: 'Store Visit', CLAIM: 'Order Claiming' }

function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Format a full datetime stamp or bare HH:MM for the confirm button label. */
function slotWhen(slot) {
  // Try SlotPicker's ISO-with-space format: "2026-09-29 10:30"
  if (/^\d{4}-\d{2}-\d{2} /.test(slot)) {
    return slotTimeLabel(slot)
  }
  // Bare HH:MM fallback
  const [h, m] = String(slot).split(':').map(Number)
  if (isNaN(h)) return slot
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`
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
 *   type      - 'VISIT' (Appointments page) | 'CLAIM' (Checkout pickup)
 *   custId    - owning customer (required)
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

  const appointType = reschedule?.type || type
  const rules = SLOT_RULES[appointType] || SLOT_RULES.VISIT

  // Seed date/slot from the existing booking when rescheduling
  const [date, setDate] = useState(() => {
    if (!reschedule?.dateISO) return ''
    return reschedule.dateISO
  })
  const [slot, setSlot] = useState('')
  const [details, setDetails] = useState(reschedule?.desc || '')
  const [booking, setBooking] = useState(false)

  // Reset slot when date changes
  const handleDateChange = (e) => {
    setDate(e.target.value)
    setSlot('')
  }

  // Slots arrive as "YYYY-MM-DD HH:MM"; a bare "HH:MM" gets the picked date.
  const slotStamp = /^\d{4}-\d{2}-\d{2} /.test(slot) ? slot : date && slot ? `${date} ${slot}` : ''

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
      showToast(reschedule ? 'Appointment updated successfully.' : 'Appointment created successfully.', 'success')
      setSlot('')
      onSuccess?.(saved)
    } catch (err) {
      showToast(
        err?.message ||
          (reschedule
            ? 'Failed to update appointment. Please try again.'
            : 'Failed to create appointment. Please try again.'),
        'error'
      )
    } finally {
      setBooking(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-4">
      {/* ── Header ── */}
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

      {/* ── Pickup Schedule header + date picker (mirrors Checkout layout) ── */}
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-900">Pick a Schedule</p>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <span>Date</span>
            <input
              type="date"
              value={date}
              min={todayISO()}
              onChange={handleDateChange}
              className="px-2 py-1.5 rounded-md border border-slate-200 text-xs text-gray-700 focus:border-brand-orange focus:ring-brand-orange/30"
            />
          </label>
        </div>

        {/* SlotPicker — same component used in Checkout Store Pickup */}
        <SlotPicker
          date={date}
          type={appointType}
          value={slot}
          onChange={setSlot}
          currentSlot={reschedule?.rawStamp || ''}
        />

        {/* Confirm chip: show once a slot is selected */}
        {slot && (
          <p className="text-xs font-semibold text-brand-orange bg-orange-50 rounded-lg p-2.5">
            {reschedule ? 'New' : 'Selected'} time: {slotWhen(slot)}
          </p>
        )}
      </div>

      {/* ── Appointment details textarea ── */}
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

      {/* ── Book / Reschedule CTA ── */}
      <button
        type="button"
        disabled={booking || !slot}
        onClick={handleBook}
        className="w-full h-9 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {booking
          ? 'Saving…'
          : slot
          ? `${reschedule ? 'Reschedule' : 'Book'} • ${slotWhen(slot)}`
          : 'Select a time slot to book'}
      </button>

      {required && !slot && (
        <p className="text-[11px] text-slate-500 text-center">A time slot is required to continue.</p>
      )}
    </div>
  )
}
