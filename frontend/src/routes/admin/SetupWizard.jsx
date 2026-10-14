import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { apiGet, apiPost } from '../../services/api.js'
import { updateSettings } from '../../services/settings.js'
import { isSuperAdminRow } from '../../components/admin/schema.js'

/*
    DOMAIN 1: SETUP - FLOW-SETUP-01..05
    ------------------------------------
    `/admin/setup` is the first-run wizard that walks the first-time
    administrator through the configuration the store cannot go live
    without (REQ-SETUP-02): store name, location, contact and operating
    hours, plus - on a database that has no employees yet - the very first
    super admin account (FLOW-SETUP-04, REQ-SETUP-03).

    It is PUBLIC on purpose: an empty roster has no account that could sign
    in, so gating it behind the employee portal would make the first super
    admin impossible to create. It stays under /admin/* because it
    configures the employee portal, never the storefront (rule 71).

    After the roster exists the same screen becomes the store's setup
    summary: read-only for anyone who is not signed in, and editable for a
    super admin (rule 40), which is what keeps FLOW-SETUP-01/02 reachable
    for the life of the system rather than only on day one.

    Rule 66 / 67: every field answers as it is typed, with the message
    directly under the field, and no message ever appears before the field
    has been touched.
*/

const STORE_FIELDS = [
  { key: 'store_name', label: 'Store name', hint: 'Shown across both portals.', placeholder: 'Tindahan ni Isko' },
  { key: 'store_location', label: 'Location', hint: 'Where customers pick up and walk in.', placeholder: 'Bicol University, Legazpi City, Albay' },
  { key: 'store_contact', label: 'Contact', hint: 'Email or phone shown to customers.', placeholder: 'tindahan.ni.isko@bicol-u.edu.ph' },
  { key: 'operating_hours', label: 'Operating hours', hint: 'Used to build the appointment calendar.', placeholder: '08:00 - 18:00' },
]

/** REQ-EMP_ENROLL-02 / rule 27 - staff identities live on the university domain. */
function emailError(value, domain) {
  const email = value.trim()
  if (!email) return 'Provide a valid email'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Provide a valid email'
  if (domain && !email.toLowerCase().endsWith(domain.toLowerCase())) return `Must end with ${domain}`
  return ''
}

function phoneError(value) {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return 'Provide a valid phone number'
  if (digits.length < 10 || digits.length > 15) return 'Provide a valid phone number'
  return ''
}

/** REQ-SETUP-03: 16+ characters with upper, lower, number and symbol. */
function passwordError(value) {
  if (!value) return '' // optional: the backend generates one instead
  if (value.length < 16) return 'Use at least 16 characters'
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return 'Needs an uppercase, a lowercase, a number and a symbol'
  }
  return ''
}

function Field({ label, hint, error, touched, children }) {
  return (
    <label className="block">
      <span className="block text-2xs font-bold text-slate-600 mb-1">{label}</span>
      {children}
      {/* Rule 67 - the message shows directly under its own field. */}
      {touched && error ? (
        <span className="block text-2xs font-semibold text-red-500 mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-2xs text-slate-400 mt-1">{hint}</span>
      ) : null}
    </label>
  )
}

const inputClass = (bad) =>
  `w-full h-10 px-3.5 rounded-xl border text-sm bg-white focus:outline-none transition-colors ${
    bad ? 'border-red-400 focus:ring-2 focus:ring-red-100' : 'border-gray-200 focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange'
  }`

export default function SetupWizard({ embedded = false }) {
  const navigate = useNavigate()
  const { currentAdminUser } = useAdmin()

  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState('')

  const [store, setStore] = useState({ store_name: '', store_location: '', store_contact: '', operating_hours: '' })
  const [account, setAccount] = useState({ surname: '', givname: '', email: '', phone: '', password: '' })
  const [touched, setTouched] = useState({})

  const canInitialize = Boolean(status?.needs_initial_super_admin)
  const domain = status?.bicol_domain || '@bicol-u.edu.ph'
  const editable = canInitialize || isSuperAdminRow(currentAdminUser)

  useEffect(() => {
    let cancelled = false
    apiGet('/setup/status')
      .then((res) => {
        if (cancelled) return
        const data = res?.data || {}
        setStatus(data)
        setStore((prev) => ({ ...prev, ...(data.store || {}) }))
      })
      .catch((err) => {
        if (!cancelled) setServerError(err?.message || 'Could not read the setup status.')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const errors = useMemo(() => {
    const storeErrors = {}
    STORE_FIELDS.forEach(({ key }) => {
      if (!store[key].trim()) storeErrors[key] = 'This field is required'
    })

    return {
      store: storeErrors,
      account: {
        surname: account.surname.trim() ? '' : 'Provide a valid surname',
        givname: account.givname.trim() ? '' : 'Provide a valid given name',
        email: emailError(account.email, domain),
        phone: phoneError(account.phone),
        password: passwordError(account.password),
      },
    }
  }, [store, account, domain])

  const storeValid = Object.keys(errors.store).length === 0
  const accountValid = Object.values(errors.account).every((message) => !message)
  const canSubmit = editable && storeValid && (canInitialize ? accountValid : true)

  const touch = (name) => setTouched((prev) => ({ ...prev, [name]: true }))

  const submit = async (event) => {
    event.preventDefault()
    setServerError('')
    // Nothing is sent until every field has answered (REQ-SETUP-01).
    setTouched(
      Object.fromEntries([
        ...STORE_FIELDS.map(({ key }) => [key, true]),
        ...Object.keys(account).map((key) => [key, true]),
      ])
    )
    if (!canSubmit) return

    setSaving(true)
    try {
      if (canInitialize) {
        await apiPost('/setup/initialize', {
          ...store,
          surname: account.surname.trim(),
          givname: account.givname.trim(),
          email: account.email.trim().toLowerCase(),
          phone: account.phone.trim(),
          ...(account.password ? { password: account.password } : {}),
        })
        setDone(true)
      } else {
        // Rule 40: only a super admin writes a system-wide key, and the API
        // refuses anyone else - the guard here just says so before the round trip.
        await updateSettings(store)
        setDone(true)
      }
    } catch (err) {
      setServerError(err?.message || 'Could not save the setup. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // A nested <main> is invalid when embedded inside the Settings shell, so the
  // wrapper downgrades to a <div> there.
  const Shell = embedded ? 'div' : 'main'

  return (
    <div className={embedded ? 'w-full' : 'min-h-screen bg-[#F8F9FA] flex flex-col'}>
      {/* Rule 69 - the working back button sits at the top left (standalone
          only: embedded inside Settings, that shell already carries a back). */}
      {!embedded && (
        <header className="w-full px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(canInitialize ? '/admin/login' : '/admin')}
            title="Back"
            aria-label="Back"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        </header>
      )}

      <Shell className={embedded ? 'w-full' : 'flex-1 flex items-start justify-center px-4 pb-10'}>
        <div className="w-full max-w-2xl">
          {/* Embedded in Settings the shell already names this section, so the
              wizard only titles itself on its own standalone page. */}
          {!embedded && (
            <div className="text-center mb-6">
              <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">Store Setup</h1>
              <p className="text-sm text-slate-500 mt-1">
                {canInitialize
                  ? 'Set up Tindahan ni Isko for your store.'
                  : 'Manage store configuration settings.'}
              </p>
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
              <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-brand-orange animate-spin" />
                Reading setup status…
              </span>
            </div>
          ) : done ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-800">Setup saved.</p>
              <p className="text-xs text-slate-500 mt-1">
                {canInitialize
                  ? 'Your first super admin account is ready. Sign in to finish configuring the store.'
                  : 'The store configuration is live across both portals.'}
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                {!embedded && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/login')}
                    className="px-5 h-10 rounded-xl bg-brand-orange text-white text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Go to sign in
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDone(false)}
                  className="px-5 h-10 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Edit again
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
              {status?.missing_critical?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-semibold text-amber-800">
                  Required fields are still empty:{' '}
                  {status.missing_critical.join(', ')}. The store cannot go live until they are filled.
                </div>
              )}

              {!canInitialize && !isSuperAdminRow(currentAdminUser) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold text-slate-600">
                  Read-only: only a super admin can change store-wide settings.{' '}
                  <button type="button" onClick={() => navigate('/admin/login')} className="text-brand-orange hover:underline cursor-pointer">
                    Sign in
                  </button>{' '}
                  to edit.
                </div>
              )}

              <section className="space-y-3">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">Store configuration</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STORE_FIELDS.map(({ key, label, hint, placeholder }) => (
                    <Field
                      key={key}
                      label={label}
                      hint={hint}
                      touched={touched[key]}
                      error={errors.store[key]}
                    >
                      <input
                        type="text"
                        value={store[key]}
                        placeholder={placeholder}
                        disabled={!editable}
                        onChange={(e) => setStore((prev) => ({ ...prev, [key]: e.target.value }))}
                        onBlur={() => touch(key)}
                        className={inputClass(Boolean(touched[key] && errors.store[key])) + (editable ? '' : ' bg-slate-50 text-slate-500')}
                      />
                    </Field>
                  ))}
                </div>
              </section>

              {canInitialize && (
                <section className="space-y-3 pt-4 border-t border-slate-100">
                  <div>
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">First super admin</h2>
                    <p className="text-2xs text-slate-400 mt-0.5">
                      Leave the password blank to automatically generate a secure temporary password.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Surname" touched={touched.surname} error={errors.account.surname}>
                      <input
                        type="text"
                        value={account.surname}
                        onChange={(e) => setAccount((prev) => ({ ...prev, surname: e.target.value }))}
                        onBlur={() => touch('surname')}
                        className={inputClass(Boolean(touched.surname && errors.account.surname))}
                      />
                    </Field>
                    <Field label="Given name" touched={touched.givname} error={errors.account.givname}>
                      <input
                        type="text"
                        value={account.givname}
                        onChange={(e) => setAccount((prev) => ({ ...prev, givname: e.target.value }))}
                        onBlur={() => touch('givname')}
                        className={inputClass(Boolean(touched.givname && errors.account.givname))}
                      />
                    </Field>
                    <Field label="Bicol University email" touched={touched.email} error={errors.account.email}>
                      <input
                        type="email"
                        value={account.email}
                        placeholder={`name${domain}`}
                        onChange={(e) => setAccount((prev) => ({ ...prev, email: e.target.value }))}
                        onBlur={() => touch('email')}
                        className={inputClass(Boolean(touched.email && errors.account.email))}
                      />
                    </Field>
                    <Field label="Phone number" touched={touched.phone} error={errors.account.phone}>
                      <input
                        type="tel"
                        value={account.phone}
                        placeholder="09171234567"
                        onChange={(e) => setAccount((prev) => ({ ...prev, phone: e.target.value }))}
                        onBlur={() => touch('phone')}
                        className={inputClass(Boolean(touched.phone && errors.account.phone))}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field
                        label="Password (optional)"
                        hint="At least 16 characters with an uppercase letter, lowercase letter, number, and symbol."
                        touched={touched.password}
                        error={errors.account.password}
                      >
                        <input
                          type="password"
                          value={account.password}
                          autoComplete="new-password"
                          onChange={(e) => setAccount((prev) => ({ ...prev, password: e.target.value }))}
                          onBlur={() => touch('password')}
                          className={inputClass(Boolean(touched.password && errors.account.password))}
                        />
                      </Field>
                    </div>
                  </div>
                </section>
              )}

              {serverError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-semibold text-red-700">
                  {serverError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    // Embedded in Settings this stays on the page: it just
                    // discards the unsaved edits instead of leaving the shell.
                    if (embedded) {
                      setStore((prev) => ({ ...prev, ...(status?.store || {}) }))
                      setTouched({})
                      setServerError('')
                      setDone(false)
                    } else {
                      navigate(canInitialize ? '/admin/login' : '/admin')
                    }
                  }}
                  className="px-5 h-10 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {embedded ? 'Reset' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || saving}
                  className="px-6 h-10 rounded-xl bg-brand-orange text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saving ? 'Saving…' : canInitialize ? 'Initialize store' : 'Save configuration'}
                </button>
              </div>
            </form>
          )}
        </div>
      </Shell>
    </div>
  )
}
