import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import { useAuth } from '../hooks/useAuth.js'
import { updateCredentials } from '../services/auth.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import Button from '../components/ui/Button.jsx'
import OtpVerifyModal from '../components/ui/OtpVerifyModal.jsx'
import { passwordProblem, PASSWORD_HINT } from '../utils/passwordRules.js'

function PasswordField({ label, name, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-semibold text-slate-800">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <input
          id={name}
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required
          autoComplete={name === 'current' ? 'current-password' : 'new-password'}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-800 placeholder-slate-400 transition-all focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={`${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={show}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-brand-orange"
        >
          {show ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7" />
              <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a15.7 15.7 0 0 1-3.2 4.1M6.2 6.3C3.5 8.1 2 12 2 12s3.5 7 10 7c1 0 2-.2 2.9-.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function SecurityIllustration() {
  return (
    <div className="relative flex h-20 w-24 shrink-0 items-center justify-center md:mx-auto md:h-40 md:w-48" aria-hidden="true">
      <div className="absolute inset-2 rounded-[2.5rem] bg-gradient-to-br from-blue-50 to-indigo-50" />
      <svg viewBox="0 0 200 170" fill="none" className="relative h-full w-full">
        <path d="M68 72V53c0-20 13-34 32-34s32 14 32 34v19" stroke="#3B82F6" strokeWidth="15" strokeLinecap="round" />
        <rect x="48" y="65" width="104" height="78" rx="14" fill="#4385F5" />
        <path d="M48 91h104v38a14 14 0 0 1-14 14H62a14 14 0 0 1-14-14V91Z" fill="#2870E8" />
        <circle cx="100" cy="101" r="10" fill="#174EA6" />
        <path d="M96 108h8l4 16h-16l4-16Z" fill="#174EA6" />
        <path d="m138 116 25-12 25 12v18c0 18-12 29-25 35-13-6-25-17-25-35v-18Z" fill="#16A34A" stroke="white" strokeWidth="6" strokeLinejoin="round" />
        <path d="m152 133 7 7 15-17" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m150 37 10-13m4 24 15-6m-13-8 9-11" stroke="#93C5FD" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function ChangePassword() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { logout } = useAuth()

  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [otpOpen, setOtpOpen] = useState(false)

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const newProblem = passwordProblem(form.newPass)
  const newValid = newProblem === ''
  const matchValid = form.newPass === form.confirm && form.confirm.length > 0
  const canSubmit = form.current.length > 0 && newValid && matchValid

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || saving) return
    // FLOW-CUST_SET-03: a password change is a sensitive change, so the
    // phone OTP comes first and the new password follows once verified.
    setOtpOpen(true)
  }

  const savePassword = async () => {
    setSaving(true)
    const { error } = await updateCredentials({
      current_password: form.current,
      new_password: form.newPass,
    })
    setSaving(false)
    if (error) {
      showToast(error, 'error')
      return
    }
    await logout()
    showToast('Password updated. Please sign in again.')
    navigate('/signin')
  }

  return (
    <FocusedLayout title="Change Password" backTo="/settings" containerClassName="max-w-5xl">
      <div className="pb-16 animate-fade-in w-full">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="grid md:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="flex flex-row items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-white to-blue-50/60 px-5 py-5 sm:px-7 md:flex-col md:justify-center md:border-b-0 md:border-r md:px-6 md:py-8 md:text-center">
              <SecurityIllustration />
              <div className="min-w-0 md:mt-2">
                <h2 className="text-base font-bold leading-tight text-slate-900">Keep Your Account Secure</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Use a strong password to protect your account and keep your data safe.
                </p>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                <PasswordField
                  label="Current Password"
                  name="current"
                  value={form.current}
                  onChange={handleChange}
                  placeholder="Enter current password"
                />
                <div className="space-y-2">
                  <PasswordField
                    label="New Password"
                    name="newPass"
                    value={form.newPass}
                    onChange={handleChange}
                    placeholder={PASSWORD_HINT}
                  />
                  {form.newPass.length > 0 && !newValid && (
                    <p className="text-xs font-semibold text-red-500">{newProblem}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <PasswordField
                    label="Confirm New Password"
                    name="confirm"
                    value={form.confirm}
                    onChange={handleChange}
                    placeholder="Re-enter new password"
                  />
                  {form.confirm.length > 0 && !matchValid && (
                    <p className="text-xs font-semibold text-red-500">Passwords do not match.</p>
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 px-5 py-5 sm:px-7">
                <Button
                  type="submit"
                  disabled={!canSubmit || saving}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-400 font-semibold text-white shadow-sm hover:from-orange-600 hover:to-orange-500"
                >
                  {saving ? 'Updating…' : 'Update Password'}
                  {!saving && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                      <path d="M5 12h14m-7-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </Button>
                <p className="flex items-start gap-2 rounded-xl bg-blue-50/80 px-3 py-2.5 text-xs font-medium leading-relaxed text-slate-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 11v5m0-8h.01" strokeLinecap="round" />
                  </svg>
                  <span>You will be asked for a one-time code sent to your phone before this change is saved.</span>
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>

      <OtpVerifyModal
        isOpen={otpOpen}
        purpose="password_change"
        title="Verify it is you"
        onClose={() => setOtpOpen(false)}
        onVerified={savePassword}
      />
    </FocusedLayout>
  )
}

export default ChangePassword
