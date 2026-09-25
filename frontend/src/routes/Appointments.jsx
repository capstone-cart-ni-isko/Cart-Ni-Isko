import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useApiData } from '../hooks/useApi.js'
import AppShell from '../components/layout/AppShell.jsx'
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx'
import { ApiErrorText } from '../components/ui/ApiErrorBoundary.jsx'
import AppointmentForm from '../components/appointment/AppointmentForm.jsx'
import AppointmentCard from '../components/appointment/AppointmentCard.jsx'
import AppointmentDetailsModal from '../components/appointment/AppointmentDetailsModal.jsx'
import { APPOINT_TYPE, fetchAppointments, SLOT_RULES } from '../services/appointments.js'
import { fetchOrder } from '../services/orders.js'

const STORE = {
  location: 'Tindahan ni Isko – Main Campus',
  subLocation: 'Bicol University, Main Campus',
}

/** The four REQ-AB filter pills, in the order the ribbon expects. */
const FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done', label: 'Done' },
  { id: 'cancelled', label: 'Cancelled' },
]

/* ── Slot / date formatting (APPOINTMENT stores one appoint_date stamp) ── */

function clockOf(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
  if (!match) return String(value || '')
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`
}

/** "9:00 AM – 9:10 AM" for a slot of the given type (VISIT 10 / CLAIM 30 min). */
function timeRange(value, type) {
  const clock = String(value || '').match(/(\d{1,2}):(\d{2})/)
  if (!clock) return 'To be confirmed'
  const minutes = Number(clock[1]) * 60 + Number(clock[2])
  const length = (SLOT_RULES[type] || SLOT_RULES.VISIT).minutes
  const stamp = (total) =>
    clockOf(`${Math.floor(total / 60) % 24}:${String(total % 60).padStart(2, '0')}`)
  return `${stamp(minutes)} – ${stamp(minutes + length)}`
}

function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function parseDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return { iso: '', date: 'To be scheduled', dayOfWeek: '' }
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return {
    iso: match[0],
    date: day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    dayOfWeek: day.toLocaleDateString('en-US', { weekday: 'long' }),
  }
}

/** Last moment the booking is still valid: its start, or end of day. */
function endMoment(value) {
  const day = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!day) return null
  const moment = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  const clock = String(value).match(/(\d{1,2}):(\d{2})/)
  if (clock) moment.setHours(Number(clock[1]), Number(clock[2]))
  else moment.setHours(23, 59)
  return moment
}

/**
 * SRS mapping: APPOINTMENT has no status column, so it is derived -
 * closed = done, elapsed but never closed = cancelled, otherwise upcoming.
 */
function mapAppointment(row, order) {
  const stamp = row.appoint_date ?? ''
  const type = String(row.appoint_type || 'VISIT').toUpperCase()
  const closed = Boolean(row.appoint_closed)
  const ends = endMoment(stamp)
  const expired = ends ? ends.getTime() < Date.now() : false

  const raw = String(row.appoint_status ?? row.status ?? '').toUpperCase()
  let status = 'upcoming'
  if (raw.includes('CANCEL') || (!closed && expired)) status = 'cancelled'
  else if (closed || ['COMPLETED', 'CLAIMED', 'CLOSED', 'DONE'].some((k) => raw.includes(k))) {
    status = 'done'
  }

  const { iso, date, dayOfWeek } = parseDate(stamp)
  const items = (order?.items || []).map((entry) => ({
    name: entry.product?.prod_name || entry.product?.name || 'Item',
    details: `Qty ${entry.item_qty ?? 1}${entry.product?.size ? ` · ${entry.product.size}` : ''}`,
    image: entry.color?.image || entry.product?.image || null,
  }))

  return {
    id: row.appoint_id ?? row.id,
    orderId: row.ord_id ?? row.order_id ?? null,
    type,
    status,
    isToday: Boolean(iso) && iso === todayISO(),
    dateISO: iso,
    date,
    dayOfWeek,
    time: timeRange(row.appoint_start ?? row.slot_start ?? stamp, type),
    desc: String(row.appoint_desc || ''),
    qr: row.appoint_qr || '',
    itemCount: items.length || Number(row.item_count ?? 1),
    items,
    ...STORE,
  }
}

/** GET /appoint/display, then the order behind each claim (PICKUP link). */
async function loadAppointments(custId) {
  if (!custId) return []
  const rows = await fetchAppointments({ cust_id: custId })
  const list = Array.isArray(rows) ? rows : []

  const orderIds = [...new Set(list.map((r) => r.ord_id ?? r.order_id).filter(Boolean))].slice(0, 12)
  const orders = await Promise.all(orderIds.map((oid) => fetchOrder(oid).catch(() => null)))
  const byId = {}
  orderIds.forEach((oid, index) => {
    if (orders[index]) byId[String(oid)] = orders[index]
  })

  return list.map((row) => mapAppointment(row, byId[String(row.ord_id ?? row.order_id)]))
}

function Appointments() {
  const { currentUser } = useAuth()
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const [filter, setFilter] = useState('today')
  const [form, setForm] = useState(null) // null | 'new' | appointment
  const [viewing, setViewing] = useState(null)

  const { data, error, isLoading, refresh } = useApiData(loadAppointments, { custId })

  // REQ-AB filters evaluated from appoint_date + appoint_closed.
  const visible = useMemo(
    () =>
      (data || []).filter((appt) =>
        filter === 'today' ? appt.isToday && appt.status === 'upcoming' : appt.status === filter
      ),
    [data, filter]
  )

  const startAdd = useCallback(() => setForm('new'), [])
  const startEdit = useCallback((appt) => {
    setViewing(null)
    setForm(appt)
  }, [])
  const closeForm = useCallback(() => setForm(null), [])

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto w-full px-4 md:px-6 py-5 pb-28 space-y-4">
        {/* Top action: full-width landscape card that mounts <AppointmentForm/> */}
        <button
          type="button"
          onClick={() => (form === 'new' ? closeForm() : startAdd())}
          aria-expanded={form === 'new'}
          className="add-appointment-cta w-full h-24 px-5 flex items-center justify-between gap-4 rounded-lg bg-gradient-to-r from-[#FF7A1A] via-[#FF6600] to-[#FF8C33] text-white text-left cursor-pointer transition-transform active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block text-base font-extrabold">Add Appointment</span>
            <span className="block text-xs font-medium text-white/85 leading-snug mt-0.5">
              Reserve a 10-minute store visit or a 30-minute order claiming slot.
            </span>
          </span>
          <span className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>

        {/* This page always books a VISIT; Checkout is the only CLAIM caller. */}
        {form && (
          <AppointmentForm
            key={form === 'new' ? 'new' : `edit-${form.id}`}
            type={APPOINT_TYPE.VISIT}
            custId={custId}
            reschedule={form === 'new' ? null : form}
            onSuccess={() => {
              closeForm()
              refresh()
            }}
            onCancel={closeForm}
          />
        )}

        {/* Filter row: four pill toggles, the list reacts instantly */}
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <h1 className="text-base font-extrabold text-slate-900 tracking-tight">My Appointments</h1>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5 mb-3">
            Your pickup schedule and store visits. Arrive at the campus store at your designated slot.
          </p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                aria-pressed={filter === id}
                className={`h-8 px-4 rounded-full text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                  filter === id
                    ? 'bg-brand-orange text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ApiErrorText error={error} fallback="Unable to load your appointments. Please try again." />

        {/* Data list */}
        {isLoading ? (
          <div className="bg-white rounded-lg p-8 border border-slate-200 flex items-center justify-center gap-3">
            <LoadingSpinner size={22} />
            <p className="text-sm font-bold text-slate-500">Loading your appointments…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
            <p className="text-sm font-bold text-slate-500">
              {error ? 'Could not load appointments right now.' : 'No appointments in this category.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                onView={() => setViewing(appt)}
                onEdit={() => startEdit(appt)}
              />
            ))}
          </div>
        )}
      </div>

      <AppointmentDetailsModal
        appointment={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => startEdit(viewing)}
      />
    </AppShell>
  )
}

export default Appointments
