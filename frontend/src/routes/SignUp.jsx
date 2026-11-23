import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import collegesData from '../data/colleges.json'
import TermsModal from '../components/ui/TermsModal.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import { passwordProblem, PASSWORD_HINT } from '../utils/passwordRules.js'
import { isPhMobile, normalizePhMobile, PH_MOBILE_MESSAGE } from '../utils/phone.js'
import brandLogo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import signInBackground from '../assets/Branding/Copy of Tindahan ni Isko BG with Elements.jpg'

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
  backgroundPosition: 'right 16px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '18px',
}

const SIGNUP_PATHS = {
  accountType: '/signup/role',
  personal: '/signup/personal',
  affiliation: '/signup/affiliation',
  security: '/signup/security',
}

// The legacy /form and /details paths are kept so saved links and browser
// history still open the Personal Information segment.
const PATH_TO_STEP = {
  '/signup': 'accountType',
  '/signup/role': 'accountType',
  '/signup/form': 'personal',
  '/signup/details': 'personal',
  '/signup/personal': 'personal',
  '/signup/affiliation': 'affiliation',
  '/signup/security': 'security',
}

const STEP_TITLES = {
  accountType: 'Account Type',
  personal: 'Personal Information',
  affiliation: 'BUeño Affiliation',
  security: 'Account Security',
}

const STEP_DESCRIPTIONS = {
  accountType: 'Choose the account that fits you to continue with registration.',
  personal: 'Tell us your name and how we can reach you.',
  affiliation: 'Tell us about your affiliation with Bicol University.',
  security: 'Set a password and review our terms to finish.',
}

function stepFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase()
  return PATH_TO_STEP[normalized] || 'accountType'
}

/** Matches the sign-in screen's instant feedback while the request is in flight. */
function CreatingAccountSkeleton() {
  return (
    <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
      Creating account…
    </span>
  )
}

function SignUp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { register } = useAuth()
  const { showToast } = useToast()

  // Flattened list of all colleges, institutes, and satellite campuses of Bicol University
  const allColleges = useMemo(() => {
    return collegesData.flatMap((campus) =>
      (campus.colleges || []).map((col) => ({
        id: col.id,
        name: col.name,
        campus: campus.name,
        departments: col.departments || col.programs || [],
      }))
    )
  }, [])

  // Initial state from localStorage. A full address is no longer collected at
  // sign-up, so any address left over from an older saved draft is discarded.
  const [form, setForm] = useState(() => {
    const defaults = {
      custType: 'BUENO', // Default to BUeño
      role: 'Student', // Student | Faculty for BUeño; Guest for guest
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      college: '',
      course: '', // department
    }
    let stored
    try {
      stored = JSON.parse(localStorage.getItem('isko_signup_progress') || 'null') || {}
    } catch {
      stored = {}
    }
    if (typeof stored !== 'object' || Array.isArray(stored)) stored = {}
    if (stored.custType !== 'BUENO' && stored.custType !== 'GUEST') {
      stored.custType = stored.role === 'Guest' ? 'GUEST' : 'BUENO'
    }
    if (stored.custType === 'GUEST') stored.role = 'Guest'
    const restored = { ...defaults, ...stored }
    delete restored.address
    delete restored.username
    return restored
  })

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isBueño = form.custType === 'BUENO'
  const BU_EMAIL_RE = /^[^\s@]+@bicol-u\.edu\.ph$/i

  // The URL is the single source of truth for the current segment, so browser
  // back/forward and saved links keep working across the segmented flow.
  const stepKey = stepFromPath(location.pathname)
  const stepKeys = isBueño
    ? ['accountType', 'personal', 'affiliation', 'security']
    : ['accountType', 'personal', 'security']
  const stepNumber = stepKeys.indexOf(stepKey) + 1

  // Real-time touched fields for validation feedback (System Rules 66 / 67)
  const [touched, setTouched] = useState({})
  const touch = (field) => setTouched((prev) => ({ ...prev, [field]: true }))
  const touchAll = (fields) =>
    setTouched((prev) => {
      const next = { ...prev }
      fields.forEach((field) => {
        next[field] = true
      })
      return next
    })

  const updateForm = (fields) => {
    setForm((prev) => ({ ...prev, ...fields }))
  }

  // Sync signup progress to localStorage
  useEffect(() => {
    localStorage.setItem('isko_signup_progress', JSON.stringify(form))
  }, [form])

  // A guest has no affiliation segment to fill out.
  useEffect(() => {
    if (!isBueño && stepKey === 'affiliation') {
      navigate(SIGNUP_PATHS.security, { replace: true })
    }
  }, [isBueño, stepKey, navigate])

  // Dynamic department options based on selected college
  const availableDepartments = useMemo(() => {
    if (!form.college) return []
    const collegeObj = allColleges.find((c) => c.name === form.college)
    return collegeObj ? collegeObj.departments : []
  }, [form.college, allColleges])

  // Validation rules
  const firstNameError = form.firstName.trim() ? '' : 'Given name is required.'
  const lastNameError = form.lastName.trim() ? '' : 'Surname is required.'

  const phoneError = !form.phone.trim()
    ? 'Phone number is required.'
    : !isPhMobile(form.phone)
      ? PH_MOBILE_MESSAGE
      : ''

  const emailValue = form.email.trim()
  const emailError = !emailValue
    ? 'Email address is required.'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)
      ? 'Enter a valid email address.'
      : isBueño && !BU_EMAIL_RE.test(emailValue)
        ? 'BUeños must use their @bicol-u.edu.ph email address.'
        : ''

  const passwordError = !password
    ? 'Password is required.'
    : passwordProblem(password)
  const confirmError = !confirmPassword
    ? 'Please re-enter your password.'
    : confirmPassword !== password
      ? 'Passwords do not match.'
      : ''
  const termsError = agreeToTerms ? '' : 'You must agree to the Terms and Privacy.'

  // BUeño-specific validation
  const roleError = isBueño && !['Student', 'Faculty'].includes(form.role)
    ? 'Please choose whether you are a student or faculty.'
    : ''
  const collegeError = isBueño && !form.college ? 'College or institute is required.' : ''
  const departmentError = isBueño && !form.course ? 'Department is required.' : ''

  const hasErrors = isBueño
    ? !!(
        firstNameError || lastNameError || phoneError || emailError ||
        passwordError || confirmError || !agreeToTerms ||
        roleError || collegeError || departmentError
      )
    : !!(
        firstNameError || lastNameError || phoneError || emailError ||
        passwordError || confirmError || !agreeToTerms
      )

  const fieldError = (field, value, message) =>
    message && (touched[field] || (value ?? '') !== '') ? (
      <p className="field-error">{message}</p>
    ) : null

  const handleTypeSelect = (type) => {
    if (type === 'GUEST') {
      updateForm({ custType: 'GUEST', role: 'Guest', college: '', course: '' })
    } else {
      const validRole = ['Student', 'Faculty'].includes(form.role) ? form.role : 'Student'
      updateForm({ custType: 'BUENO', role: validRole })
    }
  }

  const goToStep = (key) => navigate(SIGNUP_PATHS[key])

  const handleBack = () => {
    const index = stepKeys.indexOf(stepKey)
    if (index > 0) goToStep(stepKeys[index - 1])
    else navigate('/signin')
  }

  const handleContinueFromPersonal = () => {
    touchAll(['firstName', 'lastName', 'phone', 'email'])
    if (firstNameError || lastNameError || phoneError || emailError) return
    goToStep(isBueño ? 'affiliation' : 'security')
  }

  const handleContinueFromAffiliation = () => {
    touchAll(['role', 'college', 'course'])
    if (roleError || collegeError || departmentError) return
    goToStep('security')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fieldsToTouch = [
      'firstName',
      'lastName',
      'phone',
      'email',
      'password',
      'confirm',
      'terms',
      ...(isBueño ? ['role', 'college', 'course'] : [])
    ]
    touchAll(fieldsToTouch)

    if (hasErrors) return

    setIsSubmitting(true)
    const registrationDetails = {
      ...form,
      phone: normalizePhMobile(form.phone),
      role: isBueño ? form.role : 'Guest',
      password,
    }
    if (!isBueño) {
      registrationDetails.campus = ''
      registrationDetails.college = ''
      registrationDetails.course = ''
      registrationDetails.yearLevel = ''
    }

    const result = await register(registrationDetails)
    setIsSubmitting(false)

    if (result.error) {
      showToast(result.error, 'error')
      return
    }

    // The saved form is kept until the phone code is verified (VerifyOtp
    // clears it), so a failed or abandoned verification can be retried
    // without retyping everything (BUG-05).
    if (!result.requiresOtp) localStorage.removeItem('isko_signup_progress')

    if (result.requiresOtp) {
      showToast('A verification code was sent to your notification inbox.')
      navigate('/verify-otp', {
        state: {
          challenge: result.challenge,
          phone: result.phone,
          purpose: result.purpose || 'signup',
          fromSignUp: true,
        },
      })
      return
    }

    showToast('Registration complete! Please sign in.')
    navigate('/signin')
  }

  return (
    // Same branded backdrop and centered card as the sign-in screen. The
    // wrapper grows with the card so no segment is clipped on small screens.
    <div className="min-h-dvh w-full flex flex-col justify-center items-center p-4 pt-24 sm:pt-24 font-sans bg-sky-100 relative isolate">
      <img src={signInBackground} alt="" className="absolute inset-0 h-full w-full object-cover object-center" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-br from-sky-300/10 via-white/5 to-orange-300/15 pointer-events-none" aria-hidden="true" />
      <div className="absolute left-5 top-5 sm:left-8 sm:top-7 z-10 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/75 px-3 py-2 shadow-lg shadow-sky-950/10 backdrop-blur-md">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-700 text-sm font-black tracking-tight text-white shadow-sm">BU</span>
        <span className="leading-tight">
          <span className="block text-xs font-extrabold tracking-wide text-slate-900 sm:text-sm">BICOL UNIVERSITY</span>
          <span className="block text-[10px] font-semibold text-slate-600 sm:text-xs">University Student Council</span>
        </span>
      </div>
      <div className="absolute right-5 top-6 z-10 hidden rounded-full border border-white/60 bg-white/65 px-4 py-2 text-[10px] font-extrabold tracking-[0.18em] text-sky-900 shadow-sm backdrop-blur-md sm:block">
        OFFICIAL CAMPUS MERCH
      </div>

      <div className="w-full max-w-md mx-auto bg-white dark:bg-[var(--surface)] rounded-3xl shadow-lg p-6 sm:p-7 space-y-3.5 relative z-10 animate-fade-in my-auto">
        <div className="space-y-1.5 text-center">
          <div className="inline-flex mb-3">
            <img
              src={brandLogo}
              alt="Tindahan ni Isko"
              className="h-16 w-auto object-contain drop-shadow-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <BackButton variant="text" label="Back" onClick={handleBack} />
          <span className="text-[10px] font-extrabold tracking-[0.18em] text-sky-900 uppercase">
            Step {stepNumber} of {stepKeys.length}
          </span>
        </div>

        <div className="flex gap-1.5" aria-hidden="true">
          {stepKeys.map((key, index) => (
            <span
              key={key}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index < stepNumber
                  ? 'bg-brand-orange'
                  : 'bg-slate-200 dark:bg-[var(--line)]'
              }`}
            />
          ))}
        </div>

        <div className="space-y-1.5 text-center pt-1">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-[var(--ink)]">
            {STEP_TITLES[stepKey]}
          </h1>
          <p className="text-xs text-gray-500 dark:text-[var(--muted)] font-medium leading-relaxed">
            {STEP_DESCRIPTIONS[stepKey]}
          </p>
        </div>

        {/* SEGMENT 1: ACCOUNT TYPE */}
        {stepKey === 'accountType' && (
          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={() => handleTypeSelect('BUENO')}
              aria-pressed={isBueño}
              className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer text-left ${
                isBueño
                  ? 'border-brand-orange bg-brand-orange/5 text-brand-orange shadow-sm font-bold'
                  : 'border-gray-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)] text-gray-700 dark:text-[var(--ink)] hover:border-gray-300 font-medium'
              }`}
            >
              <div>
                <span className="block text-base">BUeño</span>
                <span className="block text-xs font-normal text-gray-400 dark:text-[var(--muted)] mt-0.5">
                  Current student or faculty of Bicol University
                </span>
              </div>
              {isBueño && (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-orange">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTypeSelect('GUEST')}
              aria-pressed={!isBueño}
              className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer text-left ${
                !isBueño
                  ? 'border-brand-orange bg-brand-orange/5 text-brand-orange shadow-sm font-bold'
                  : 'border-gray-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)] text-gray-700 dark:text-[var(--ink)] hover:border-gray-300 font-medium'
              }`}
            >
              <div>
                <span className="block text-base">Guest</span>
                <span className="block text-xs font-normal text-gray-400 dark:text-[var(--muted)] mt-0.5">
                  No university affiliation
                </span>
              </div>
              {!isBueño && (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-orange">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => goToStep('personal')}
              className="btn btn--lg btn--block rounded-xl font-semibold shadow-xs transition-all btn--primary text-white cursor-pointer btn-press"
            >
              Continue
            </button>

            <p className="text-center text-xs text-gray-500 dark:text-[var(--muted)] font-medium pt-2">
              Already have an account?{' '}
              <Link to="/signin" className="text-brand-orange font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        )}

        {/* SEGMENT 2: PERSONAL INFORMATION */}
        {stepKey === 'personal' && (
          <form onSubmit={(e) => { e.preventDefault(); handleContinueFromPersonal() }} className="space-y-3" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-first-name" className="field-label">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="signup-first-name"
                  type="text"
                  autoComplete="given-name"
                  placeholder="First Name"
                  value={form.firstName}
                  onChange={(e) => updateForm({ firstName: e.target.value })}
                  onBlur={() => touch('firstName')}
                  aria-invalid={touched.firstName && firstNameError ? 'true' : undefined}
                  className={`field-input field-input--lg ${
                    touched.firstName && firstNameError ? 'field-input--error' : ''
                  }`}
                />
                {fieldError('firstName', form.firstName, firstNameError)}
              </div>
              <div>
                <label htmlFor="signup-last-name" className="field-label">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="signup-last-name"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) => updateForm({ lastName: e.target.value })}
                  onBlur={() => touch('lastName')}
                  aria-invalid={touched.lastName && lastNameError ? 'true' : undefined}
                  className={`field-input field-input--lg ${
                    touched.lastName && lastNameError ? 'field-input--error' : ''
                  }`}
                />
                {fieldError('lastName', form.lastName, lastNameError)}
              </div>
            </div>

            <div>
              <label htmlFor="signup-phone" className="field-label">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                id="signup-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={16}
                placeholder="09123456789"
                value={form.phone}
                onChange={(e) => updateForm({ phone: e.target.value })}
                onBlur={() => touch('phone')}
                aria-invalid={touched.phone && phoneError ? 'true' : undefined}
                className={`field-input field-input--lg ${
                  touched.phone && phoneError ? 'field-input--error' : ''
                }`}
              />
              {fieldError('phone', form.phone, phoneError)}
              {!fieldError('phone', form.phone, phoneError) && (
                <p className="field-hint">
                  We&apos;ll send a verification code to this phone number.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="signup-email" className="field-label">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder={isBueño ? 'user@bicol-u.edu.ph' : 'user@example.com'}
                value={form.email}
                onChange={(e) => updateForm({ email: e.target.value })}
                onBlur={() => touch('email')}
                aria-invalid={touched.email && emailError ? 'true' : undefined}
                className={`field-input field-input--lg ${
                  touched.email && emailError ? 'field-input--error' : ''
                }`}
              />
              {fieldError('email', form.email, emailError)}
              {isBueño && !fieldError('email', form.email, emailError) && (
                <p className="field-hint">
                  BUeños must use their official @bicol-u.edu.ph institutional email.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn--lg btn--block rounded-xl font-semibold shadow-xs transition-all btn--primary text-white cursor-pointer btn-press"
            >
              Continue
            </button>

            <p className="text-center text-xs text-gray-500 dark:text-[var(--muted)] font-medium pt-2">
              Already have an account?{' '}
              <Link to="/signin" className="text-brand-orange font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </form>
        )}

        {/* SEGMENT 3: BUENO AFFILIATION (BUeño accounts only) */}
        {stepKey === 'affiliation' && (
          <form onSubmit={(e) => { e.preventDefault(); handleContinueFromAffiliation() }} className="space-y-3" noValidate>
            <div>
              <span className="field-label">
                I am a... <span className="text-red-500">*</span>
              </span>
              <div className="space-y-3">
                {[
                  { value: 'Student', description: 'Currently enrolled in a degree program' },
                  { value: 'Faculty', description: 'Teaching or academic staff member' },
                ].map((role) => {
                  const selected = form.role === role.value
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => updateForm({ role: role.value })}
                      aria-pressed={selected}
                      className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer text-left ${
                        selected
                          ? 'border-brand-blue bg-brand-blue/5 text-brand-blue shadow-sm font-bold'
                          : 'border-gray-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)] text-gray-700 dark:text-[var(--ink)] hover:border-gray-300 font-medium'
                      }`}
                    >
                      <div>
                        <span className="block text-base">{role.value}</span>
                        <span className="block text-xs font-normal text-gray-400 dark:text-[var(--muted)] mt-0.5">
                          {role.description}
                        </span>
                      </div>
                      {selected && (
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-blue">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {fieldError('role', form.role, roleError)}
            </div>

            <div>
              <label htmlFor="signup-college" className="field-label">
                College / Institute / Satellite Campus <span className="text-red-500">*</span>
              </label>
              <select
                id="signup-college"
                value={form.college}
                onChange={(e) => {
                  updateForm({ college: e.target.value, course: '' })
                }}
                onBlur={() => touch('college')}
                aria-invalid={touched.college && collegeError ? 'true' : undefined}
                className={`field-input field-input--lg appearance-none cursor-pointer pr-10 ${
                  touched.college && collegeError ? 'field-input--error' : ''
                }`}
                style={selectStyle}
              >
                <option value="">Select College, Institute, or Campus</option>
                {allColleges.map((col) => (
                  <option key={col.id} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>
              {fieldError('college', form.college, collegeError)}
            </div>

            <div>
              <label htmlFor="signup-department" className="field-label">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="signup-department"
                value={form.course}
                onChange={(e) => updateForm({ course: e.target.value })}
                onBlur={() => touch('course')}
                disabled={!form.college}
                aria-invalid={touched.course && departmentError ? 'true' : undefined}
                className={`field-input field-input--lg appearance-none cursor-pointer pr-10 disabled:opacity-50 ${
                  touched.course && departmentError ? 'field-input--error' : ''
                }`}
                style={selectStyle}
              >
                <option value="">
                  {form.college ? 'Select Department' : 'Select a college first'}
                </option>
                {availableDepartments.map((dept, i) => (
                  <option key={i} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              {fieldError('course', form.course, departmentError)}
            </div>

            <button
              type="submit"
              className="btn btn--lg btn--block rounded-xl font-semibold shadow-xs transition-all btn--primary text-white cursor-pointer btn-press"
            >
              Continue
            </button>

            <p className="text-center text-xs text-gray-500 dark:text-[var(--muted)] font-medium pt-2">
              Already have an account?{' '}
              <Link to="/signin" className="text-brand-orange font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </form>
        )}

        {/* SEGMENT 4: ACCOUNT SECURITY */}
        {stepKey === 'security' && (
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div>
              <label htmlFor="signup-password" className="field-label">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={PASSWORD_HINT}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => touch('password')}
                  aria-invalid={touched.password && passwordError ? 'true' : undefined}
                  className={`field-input field-input--lg pr-20 ${
                    touched.password && passwordError ? 'field-input--error' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-brand-orange transition-colors"
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldError('password', password, passwordError)}
            </div>

            <div>
              <label htmlFor="signup-confirm-password" className="field-label">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="signup-confirm-password"
                  type={showConfirmPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => touch('confirm')}
                  aria-invalid={touched.confirm && confirmError ? 'true' : undefined}
                  className={`field-input field-input--lg pr-20 ${
                    touched.confirm && confirmError ? 'field-input--error' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-brand-orange transition-colors"
                >
                  {showConfirmPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldError('confirm', confirmPassword, confirmError)}
            </div>

            <div className="pt-1">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="agree-terms"
                  checked={agreeToTerms}
                  onChange={(e) => {
                    setAgreeToTerms(e.target.checked)
                    touch('terms')
                  }}
                  className="mt-0.5 rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                />
                <label htmlFor="agree-terms" className="text-xs text-gray-500 dark:text-[var(--muted)] font-medium leading-tight cursor-pointer">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="font-semibold text-brand-orange hover:underline cursor-pointer"
                  >
                    Terms and Privacy Policy
                  </button>
                  .
                </label>
              </div>
              {fieldError('terms', agreeToTerms ? 'yes' : '', termsError)}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`btn btn--lg btn--block rounded-xl font-semibold shadow-xs transition-all ${
                !isSubmitting
                  ? 'btn--primary text-white cursor-pointer btn-press'
                  : 'btn--secondary cursor-not-allowed opacity-60'
              }`}
            >
              {isSubmitting ? <CreatingAccountSkeleton /> : 'Create Account'}
            </button>

            <p className="text-center text-xs text-gray-500 dark:text-[var(--muted)] font-medium pt-2">
              Already have an account?{' '}
              <Link to="/signin" className="text-brand-orange font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </form>
        )}
      </div>

      <TermsModal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
        onAgree={() => {
          setAgreeToTerms(true)
          touch('terms')
          setShowTerms(false)
        }}
      />
    </div>
  )
}

export default SignUp
