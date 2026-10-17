import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import AppointmentForm from '../components/appointment/AppointmentForm.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'
import { saveCheckoutSlot } from '../services/checkout.js'

/**
 * /book — DOMAIN 21/22 "book an appointment" page.
 *
 * The standalone booking page the Appointments ribbon routes through, and the
 * page the checkout pickup flow (FLOW-CHECKOUT-04) sends the customer to:
 *
 *   /book?return=/checkout  -> the form COLLECTS the claim slot only. Nothing
 *   is posted to /appoint/create here (FLOW-CHECKOUT-06): the details are
 *   parked in sessionStorage and handed back to /checkout, where the whole
 *   checkout transaction creates the appointment together with the order.
 *
 * Without that query the standalone flow keeps creating its appointment and
 * lands on /appointments (FLOW-APPOINT-*) untouched.
 */
function BookAppointment() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const [saved, setSaved] = useState(null)
  const [showLogin, setShowLogin] = useState(false)

  // Checkout (DOMAIN 26) routes pickup through here and back: the return path
  // travels in the query string so a plain link/back button keeps working.
  const returnTo = searchParams.get('return') || location.state?.returnTo || '/appointments'
  const pickupMode = returnTo === '/checkout' || Boolean(location.state?.pickup)
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const handleSuccess = (appointment) => {
    if (pickupMode) {
      // FLOW-CHECKOUT-05/06: hand the collected details back to /checkout.
      // They live only in sessionStorage until the order is placed - the
      // appointment row itself is created inside the checkout transaction.
      saveCheckoutSlot(appointment)
      navigate('/checkout', { state: { slot: appointment }, replace: false })
      return
    }

    setSaved(appointment)
    navigate('/appointments', { state: { booked: appointment } })
  }

  if (!currentUser) {
    return (
      <FocusedLayout
        title="Book an Appointment"
        backTo={returnTo}
        backLabel={pickupMode ? 'Back to Checkout' : 'Back to Appointments'}
        containerClassName="max-w-md"
      >
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <p className="text-sm font-semibold text-gray-500 mb-4">
            Sign in to book an appointment.
          </p>
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="h-10 px-5 rounded-lg bg-brand-orange text-white text-sm font-semibold cursor-pointer"
          >
            Sign In
          </button>
        </div>
        <LoginPromptModal
          isOpen={showLogin}
          onClose={() => setShowLogin(false)}
          message="Sign in to book an appointment."
        />
      </FocusedLayout>
    )
  }

  return (
    <FocusedLayout
      title={pickupMode ? 'Choose Your Pickup Slot' : 'Book an Appointment'}
      subtitle={
        pickupMode
          ? 'Pick the slot you will claim your order in'
          : 'Reserve a store visit or order pickup slot'
      }
      backTo={returnTo}
      backLabel={pickupMode ? 'Back to Checkout' : 'Back to Appointments'}
      containerClassName="max-w-2xl"
      rightAction={
        !pickupMode ? (
          <Link
            to="/appointments"
            className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer"
          >
            My Appointments
          </Link>
        ) : null
      }
    >
      <div className="w-full pb-20 space-y-4 animate-fade-in">
        <p className="text-xs text-slate-500 leading-relaxed">
          {pickupMode
            ? 'Pick the slot you will claim your order in. It is saved with your order at checkout - nothing is booked until the order is placed.'
            : 'Choose a store visit or a pickup slot. Slots are 10 minutes long, open at least 30 minutes from now, and only where a staff member is scheduled.'}
        </p>

        <AppointmentForm
          key={pickupMode ? 'pickup' : 'standalone'}
          type={pickupMode ? 'PICKUP' : null}
          custId={custId}
          collectOnly={pickupMode}
          onSuccess={handleSuccess}
          onCancel={() => navigate(returnTo)}
        />

        {saved && (
          <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            Appointment saved — reference {saved.appoint_qr || saved.appoint_id}.
          </p>
        )}
      </div>
    </FocusedLayout>
  )
}

export default BookAppointment
