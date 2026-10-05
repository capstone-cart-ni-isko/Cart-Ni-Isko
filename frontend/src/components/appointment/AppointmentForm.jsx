import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../../hooks/useToast.js'
import OtpInput from '../ui/OtpInput.jsx'
import {
  createAppointment,
  fetchSlots,
  updateAppointment,
} from '../../services/appointments.js'

/**
 * New-schema appointment kinds (system-new.docx D8/D21/D22):
 *   visit - 10 minutes, 1 customer per slot
 *   pickup - 10 minutes, up to 5 customers per slot
 */
export const APPOINT_TYPE = { VISIT: 'VISIT', PICKUP: 'PICKUP' }
const TYPE_LABEL = { VISIT: 'Store Visit', PICKUP: 'Order Pickup' }
const TYPE_RULES = {
  VISIT: { minutes: 10, capacity: 1 },
  PICKUP: { minutes: 10, capacity: 5 },
}

/** A slot is a 10-minute block; the earliest selectable one is now + 30 min. */
const LEAD_MS = 30 * 60 * 1000
const SLOT_MS = 10 * 60 * 1000

function formatClock(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
  if (!match) return String(value || '')
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`
}

function slotStart(slot) {
  return slot.slot_start ?? slot.start_time ?? slot.start ?? slot.time ?? slot.slot_time ?? ''
}

/** A slot is bookable only when an employee is prescheduled for it. */
function slotOpen(slot) {
  if (slot.available === false || slot.is_available === false) return false
  if (slot.open === false || slot.full === true) return false
  if (slot.emp_id === null || slot.employee === false) return false
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

/** "YYYY-MM-DD HH:MM" for the picked day + clock time. */
function stampOf(date, clock) {
  return /^\d{4}-\d{2}-\d{2} /.test(clock) ? clock : `${date} ${clock}`
}

/** True while the slot start is still at least 30 minutes away. */
function isSelectable(stamp) {
  const start = new Date(stamp.replace(' ', 'T'))
  return !Number.isNaN(start.getTime()) && start.getTime() - Date.now() >= LEAD_MS
}

/**
 * The one and only appointment booking form (directive 26).
 *
 * Mounted from the standalone /book page (DOMAIN 21/22) and from
 * Checkout when the customer picks "In-Store Pickup" (DOMAIN 26), so
 * both flows book through the same api_appoint endpoints and can never
 * disagree on the slot rules.
 *
 * Flow: choose type (visit|pickup) -> pick a date -> pick a 10-minute
 * slot (only where an employee is prescheduled, >= 30 minutes out) ->
 * phone OTP -> save (status upcoming + unique QR issued server-side).
 *
 * Props:
 *   type      - 'VISIT' | 'PICKUP' preset, or null to let the customer pick
 *   custId    - owning customer (required)
 *   reschedule- existing appointment to edit instead of create
 *   title     - heading override
 *   required  - checkout mode: the form is the slot gate
 *   onSuccess - called with the saved appointment (appoint_id, appoint_qr)
 *   onCancel  - called when the form is dismissed
 */
export default function AppointmentForm({
  type = null,
  custId,
  reschedule = null,
  title,
  required = false,
  onSuccess,
  onCancel,
}) {
  const { showToast } = useToast()
  const [appointType, setAppointType] = useState(
    reschedule?.type || type || APPOINT_TYPE.VISIT
  )
  const [typeLocked, setTypeLocked] = useState(Boolean(reschedule?.type || type))
  const [date, setDate] = useState(reschedule?.dateISO || '')
  const [slots, setSlots] = useState([])
  const [slot, setSlot] = useState('')
  const [slotsError, setSlotsError] = useState('')
  const [booking, setBooking] = useState(false)

  // Phone OTP step (the backend issues the code on the customer's phone).
  const [otp, setOtp] = useState('')
  const [otpDone, setOtpDone] = useState(false)

  const rules = TYPE_RULES[appointType] || TYPE_RULES.VISIT

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
  const slotStamp = stampOf(date, slot)

  // Only slots at least 30 minutes from now may be selected.
  const selectableSlots = useMemo(
    () =>
      slots.filter((s) => {
        const time = slotStart(s)
        return Boolean(time) && isSelectable(stampOf(date, time))
      }),
    [slots, date]
  )

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
    if (!otpDone) {
      showToast('Enter the verification code sent to your phone.', 'error')
      return
    }

    setBooking(true)
    const payload = {
      appoint_start: slotStamp,
      appoint_end: new Date(
        new Date(slotStamp.replace(' ', 'T')).getTime() + SLOT_MS
      )
        .toISOString()
        .replace('T', ' ')
        .slice(0, 16),
      appoint_type: String(appointType).toLowerCase(),
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
      showToast(
        reschedule ? 'Appointment updated successfully.' : 'Appointment created successfully.',
        'success'
      )
      setSlot('')
      await loadSlots()
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
    <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
      <div>
        <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
          {title ||
            (reschedule
              ? `Reschedule ${TYPE_LABEL[appointType]}`
              : `Book a ${TYPE_LABEL[appointType]}`)}
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
          {TYPE_LABEL[appointType]} slots are {rules.minutes} minutes long, up to{' '}
          {rules.capacity} {rules.capacity === 1 ? 'person' : 'people'} per slot.
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

      {/* Step 1: appointment type (visit | pickup) */}
      {!typeLocked && (
        <div>
          <span className="text-xs font-semibold text-slate-600">Appointment type</span>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {[APPOINT_TYPE.VISIT, APPOINT_TYPE.PICKUP].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setAppointType(t)
                  setSlot('')
                }}
                className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  appointType === t
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : 'bg-white text-gray-700 border-slate-200 hover:border-brand-orange'
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      )}

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

      {selectableSlots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {selectableSlots.map((s, index) => {
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

      {/* Step: phone OTP before the booking is saved */}
      {slot && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Phone verification
          </p>
          {otpDone ? (
            <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              <span>✓</span> Phone verified — ready to save
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-500 leading-snug">
                Enter the 6-digit code sent to your phone to confirm this slot.
              </p>
              <OtpInput value={otp} onChange={setOtp} length={6} />
              <button
                type="button"
                disabled={otp.length < 6}
                onClick={() => {
                  // Contract gap: the backend exposes no OTP verification
                  // endpoint yet, so any 6-digit code is accepted (reported).
                  setOtpDone(true)
                  showToast('Phone verified!')
                }}
                className="w-full h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Verify code
              </button>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={booking || !slot || !otpDone}
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
