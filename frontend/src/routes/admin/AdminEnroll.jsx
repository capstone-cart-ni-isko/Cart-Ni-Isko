import { useState, useMemo } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { apiPost } from '../../services/api.js'
import { empCateg } from '../../components/admin/schema.js'

const BICOL_DOMAIN = '@bicol-u.edu.ph'

const CATEGORY_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'super admin', label: 'Super Admin' },
]

/**
 * DOMAIN 6 — Employee enrollment (super admin only).
 * The Bicol University email domain is validated in realtime; on
 * success the generated temporary password is shown with a
 * confirmation, and a duplicate email surfaces a clear error.
 */
function AdminEnrollForm() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [surname, setSurname] = useState('')
  const [givname, setGivname] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState('staff')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { tempPassword, name, email }

  // Realtime @bicol-u.edu.ph domain validation (REQ-EMP_ENROLL).
  const emailValue = email.trim().toLowerCase()
  const emailValid = useMemo(
    () => emailValue.endsWith(BICOL_DOMAIN) && emailValue.length > BICOL_DOMAIN.length,
    [emailValue]
  )
  const emailTouched = emailValue.length > 0

  const canSubmit =
    surname.trim().length > 0 &&
    givname.trim().length > 0 &&
    emailValid &&
    phone.trim().length > 0 &&
    !isSubmitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setResult(null)
    try {
      const res = await apiPost('/auth/emp_signup', {
        surname: surname.trim(),
        givname: givname.trim(),
        email: emailValue,
        phone: phone.trim(),
        callcode: '+63',
        pronoun: 'they/them',
        // New-schema vocabulary; the backend also accepts the legacy
        // uppercase alias for the same column.
        categ: category,
        type: category.toUpperCase(),
      })

      const user = res?.data || {}
      const tempPassword =
        user.temporary_password || user.temp_password || user.password || null

      // REQ-EMP_ENROLL-05: the enrollment - successes and failures alike - is
      // written to the access log by the backend (FLOW-EMP_ENROLL-07), so the
      // screen never posts a log row of its own.

      setResult({
        tempPassword,
        name: `${givname.trim()} ${surname.trim()}`,
        email: emailValue,
        category,
      })
      showToast(`Employee enrolled${tempPassword ? ' — temporary password generated' : ''}.`, 'success')
    } catch (err) {
      // REQ-EMP_ENROLL-04: the duplicate answer from POST /auth/emp_signup
      // (409) and every other backend message is surfaced verbatim instead of
      // being replaced with a generic "enrollment failed".
      const status = err?.status || err?.response?.status
      const message = String(err?.payload?.message || err?.message || 'Enrollment failed')
      if (status === 409 || /duplicate|already exists|already taken|exists/i.test(message)) {
        showToast(`The email ${emailValue} is already enrolled. Use a different Bicol University email.`, 'error')
      } else {
        showToast(message, 'error')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setSurname('')
    setGivname('')
    setEmail('')
    setPhone('')
    setCategory('staff')
    setResult(null)
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
            Enroll Staff
          </h1>
          <p className="text-sm text-slate-500 font-normal mt-1">
            Create a new employee account with a Bicol University email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Surname <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="e.g. Dela Cruz"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Given name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={givname}
                onChange={(e) => setGivname(e.target.value)}
                placeholder="e.g. Juan"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Bicol University email <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@bicol-u.edu.ph"
              aria-invalid={emailTouched && !emailValid}
              className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-1 transition-all ${
                emailTouched && !emailValid
                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
              }`}
            />
            <p className={`text-[11px] mt-1 ${emailTouched && !emailValid ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
              {emailTouched && !emailValid
                ? `Email must end with ${BICOL_DOMAIN}`
                : `Must be a valid ${BICOL_DOMAIN} address.`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Phone number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 912 345 6789"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Initial category <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={resetForm}
              className="h-9 px-4 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-9 px-4 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Enrolling…' : 'Enroll employee'}
            </button>
          </div>
        </form>

        {/* Success confirmation with the generated temporary password */}
        {result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3 animate-slide-up">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-bold text-emerald-900">
                  Employee enrolled
                </h2>
                <p className="text-xs text-emerald-700">
                  {result.name} ({result.email}) is now a{' '}
                  <span className="font-semibold">{result.category}</span> with
                  an active account.
                </p>
              </div>
            </div>
            {result.tempPassword ? (
              <div className="bg-white border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">
                    Temporary password
                  </p>
                  <p className="text-sm font-mono font-bold text-slate-900 break-all">
                    {result.tempPassword}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(result.tempPassword).catch(() => {})
                    showToast('Temporary password copied.', 'success')
                  }}
                  className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer shrink-0"
                >
                  Copy
                </button>
              </div>
            ) : (
              <p className="text-xs text-emerald-700">
                The account is active — the employee can sign in with the
                credentials issued by the system.
              </p>
            )}
            <p className="text-[11px] text-emerald-700/80">
              Share the temporary password securely — a copy has also been
              emailed to the employee's Bicol University inbox
              (FLOW-EMP_ENROLL-04). The employee will be prompted to set
              their own password on first sign-in, and the temporary
              password expires 24 hours after enrollment.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="h-8 px-3 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100/60 cursor-pointer"
              >
                Enroll another
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/staff')}
                className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
              >
                Go to staff directory
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

/** Super admins only (D5/D6). The route itself is guarded in App.jsx too. */
export default function AdminEnroll() {
  const { currentAdminUser } = useAdmin()
  const categ = empCateg(currentAdminUser || {})
  const roleKey = currentAdminUser?.roleKey
  if (roleKey && roleKey !== 'SUPER_ADMIN') return <Navigate to="/admin/dashboard" replace />
  if (!roleKey && categ !== 'super admin') return <Navigate to="/admin/dashboard" replace />
  return <AdminEnrollForm />
}
