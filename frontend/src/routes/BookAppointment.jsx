import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import AppShell from '../components/layout/AppShell.jsx'
import AppointmentForm from '../components/appointment/AppointmentForm.jsx'
import BackButton from '../components/ui/BackButton.jsx'
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
      <AppShell showNav={false}>
        <div className="min-h-dvh flex flex-col items-center justify-center p-6">
          <p className="text-sm font-semibold text-gray-500 mb-4">
            Sign in to book an appointment.
          </p>
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="h-10 px-5 rounded-lg bg-brand-orange text-white text-sm font-bold cursor-pointer"
          >
            Sign In
          </button>
        </div>
        <LoginPromptModal
          isOpen={showLogin}
          onClose={() => setShowLogin(false)}
          message="Sign in to book an appointment."
        />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto w-full px-4 md:px-6 py-5 pb-28 space-y-4">
        {/* Back button top-left (NAVIGATION RULE 68) */}
        <div className="flex items-center justify-between">
          <BackButton
            to={returnTo}
            label={pickupMode ? 'Back to Checkout' : 'Back to Appointments'}
          />
          {!pickupMode && (
            <Link
              to="/appointments"
              className="text-xs font-bold text-brand-orange hover:underline cursor-pointer"
            >
              My Appointments
            </Link>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {pickupMode ? 'Choose Your Pickup Slot' : 'Book an Appointment'}
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed mt-1">
            {pickupMode
              ? 'Pick the slot you will claim your order in. It is saved with your order at checkout - nothing is booked until the order is placed.'
              : 'Choose a store visit or a pickup slot. Slots are 10 minutes long, open at least 30 minutes from now, and only where a staff member is scheduled.'}
          </p>
        </div>

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
    </AppShell>
  )
}

export default BookAppointment
