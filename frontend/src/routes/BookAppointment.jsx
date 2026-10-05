import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import AppShell from '../components/layout/AppShell.jsx'
import AppointmentForm from '../components/appointment/AppointmentForm.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'

/**
 * /book — DOMAIN 21/22 "book an appointment" page.
 *
 * The standalone booking page the Appointments ribbon and the checkout
 * pickup flow both route through. On success the form hands the saved
 * appointment (status upcoming + unique QR) back: checkout returns to
 * /checkout with it in route state, the standalone flow lands on
 * /appointments.
 */
function BookAppointment() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()
  const [saved, setSaved] = useState(null)
  const [showLogin, setShowLogin] = useState(false)

  // Checkout (DOMAIN 26) routes pickup through here and back.
  const returnTo = location.state?.returnTo || '/appointments'
  const pickupMode = Boolean(location.state?.pickup)
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  const handleSuccess = (appointment) => {
    setSaved(appointment)
    if (pickupMode) {
      navigate('/checkout', { state: { appointment }, replace: false })
    } else {
      navigate('/appointments', { state: { booked: appointment } })
    }
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
          <Link
            to="/appointments"
            className="text-xs font-bold text-brand-orange hover:underline cursor-pointer"
          >
            My Appointments
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Book an Appointment
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed mt-1">
            Choose a store visit or a pickup slot. Slots are 10 minutes long, open
            at least 30 minutes from now, and only where a staff member is
            scheduled.
          </p>
        </div>

        <AppointmentForm
          key={pickupMode ? 'pickup' : 'standalone'}
          type={pickupMode ? 'PICKUP' : null}
          custId={custId}
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
