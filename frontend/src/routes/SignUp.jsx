import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import collegesData from '../data/colleges.json'
import Button from '../components/ui/Button.jsx'
import TermsModal from '../components/ui/TermsModal.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import brandLogo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
  backgroundPosition: 'right 16px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '18px',
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

  // Initial State from localStorage
  const [form, setForm] = useState(() => {
    const defaults = {
      custType: 'BUENO', // Default to BUeño
      role: 'Student',   // Student | Alumni | Faculty for BUeño; Guest for guest
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      username: '',
      address: '',
      college: '',
      course: '',        // department
    }
    let stored
    try {
      stored = JSON.parse(localStorage.getItem('isko_signup_progress')) || {}
    } catch {
      stored = {}
    }
    if (typeof stored !== 'object' || Array.isArray(stored)) stored = {}
    if (stored.custType !== 'BUENO' && stored.custType !== 'GUEST') {
      stored.custType = stored.role === 'Guest' ? 'GUEST' : 'BUENO'
    }
    if (stored.custType === 'GUEST') stored.role = 'Guest'
    return { ...defaults, ...stored }
  })

  // Form Step: 0 = Selection of BUeño or Guest, 1 = Actual Signup Form
  const [formStep, setFormStep] = useState(() => {
    const path = location.pathname.toLowerCase()
    if (path.includes('form') || path.includes('details')) return 1
    return 0
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

  // Real-time touched fields for validation feedback (System Rules 66 / 67)
  const [touched, setTouched] = useState({})
  const touch = (field) => setTouched((prev) => ({ ...prev, [field]: true }))
  const touchAll = (fields) =>
    setTouched((prev) => {
      const next = { ...prev }
      fields.forEach((field) => { next[field] = true })
      return next
    })

  const updateForm = (fields) => {
    setForm((prev) => ({ ...prev, ...fields }))
  }

  // Sync signup progress to localStorage
  useEffect(() => {
    localStorage.setItem('isko_signup_progress', JSON.stringify(form))
  }, [form])

  // Sync step with route path if navigated via browser history
  useEffect(() => {
    const path = location.pathname.toLowerCase()
    if (path.includes('form') || path.includes('details')) {
      setFormStep(1)
    } else {
      setFormStep(0)
    }
  }, [location.pathname])

  // Dynamic department options based on selected college
  const availableDepartments = useMemo(() => {
    if (!form.college) return []
    const collegeObj = allColleges.find((c) => c.name === form.college)
    return collegeObj ? collegeObj.departments : []
  }, [form.college, allColleges])

  // Validation rules
  const firstNameError = form.firstName.trim() ? '' : 'Given name is required.'
  const lastNameError = form.lastName.trim() ? '' : 'Surname is required.'

  const phoneDigits = form.phone.replace(/\D/g, '')
  const phoneError = !form.phone.trim()
    ? 'Phone number is required.'
    : phoneDigits.length < 10 || phoneDigits.length > 11
      ? 'Enter a valid phone number (10 to 11 digits).'
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
    : password.length < 8
      ? 'Password must be at least 8 characters.'
      : ''
  const confirmError = !confirmPassword
    ? 'Please re-enter your password.'
    : confirmPassword !== password
      ? 'Passwords do not match.'
      : ''
  const termsError = agreeToTerms ? '' : 'You must agree to the Terms and Privacy.'

  // BUeño-specific validation
  const roleError = isBueño && !['Student', 'Alumni', 'Faculty'].includes(form.role)
    ? 'Please choose whether a student, alumni, or faculty.'
    : ''
  const addressError = isBueño && !form.address?.trim() ? 'Address is required.' : ''
  const collegeError = isBueño && !form.college ? 'College or institute is required.' : ''
  const departmentError = isBueño && !form.course ? 'Department is required.' : ''

  const hasErrors = isBueño
    ? !!(
        firstNameError || lastNameError || phoneError || emailError ||
        passwordError || confirmError || !agreeToTerms ||
        roleError || addressError || collegeError || departmentError
      )
    : !!(
        firstNameError || lastNameError || phoneError || emailError ||
        passwordError || confirmError || !agreeToTerms
      )

  const fieldError = (field, value, message) =>
    message && (touched[field] || (value ?? '') !== '') ? (
      <p className="text-red-500 text-[11px] font-semibold mt-1">{message}</p>
    ) : null

  const handleTypeSelect = (type) => {
    if (type === 'GUEST') {
      updateForm({ custType: 'GUEST', role: 'Guest', college: '', course: '', address: '' })
    } else {
      const validRole = ['Student', 'Alumni', 'Faculty'].includes(form.role) ? form.role : 'Student'
      updateForm({ custType: 'BUENO', role: validRole })
    }
  }

  const handleProceedToForm = () => {
    setFormStep(1)
    navigate('/signup/form')
  }

  const handleBackToTypeSelection = () => {
    setFormStep(0)
    navigate('/signup/role')
  }

  const handleBackToSignIn = () => {
    navigate('/signin')
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
      ...(isBueño ? ['role', 'address', 'college', 'course'] : [])
    ]
    touchAll(fieldsToTouch)

    if (hasErrors) return

    setIsSubmitting(true)
    const registrationDetails = {
      ...form,
      role: isBueño ? form.role : 'Guest',
      password,
    }
    if (!isBueño) {
      registrationDetails.campus = ''
      registrationDetails.college = ''
      registrationDetails.course = ''
      registrationDetails.yearLevel = ''
      registrationDetails.address = ''
    }

    const result = await register(registrationDetails)
    setIsSubmitting(false)

    if (result.error) {
      showToast(result.error, 'error')
      return
    }

    localStorage.removeItem('isko_signup_progress')

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
    // One page wrapper and one card: on a phone the card is the page (full
    // width, no frame); from `sm` up it is a centred card at a fixed width.
    <div className="min-h-dvh w-full bg-white dark:bg-[var(--surface)] sm:bg-slate-50 sm:dark:bg-[var(--surface-2)] flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full sm:max-w-lg animate-fade-in">
        {/* FORM 1: SELECTION OF BUeño OR GUEST (Separate form from the actual signup form) */}
        {formStep === 0 && (
          <div className="bg-white dark:bg-[var(--surface)] sm:rounded-3xl sm:shadow-xl px-5 py-6 sm:p-8 space-y-5">
            <div className="flex justify-start">
              {/* System Rule 69: Back button at top-left */}
              <BackButton onClick={handleBackToSignIn} to="/signin" />
            </div>

            <div className="space-y-3 text-center">
              <img
                src={brandLogo}
                alt="Tindahan ni Isko"
                className="h-16 w-auto object-contain mx-auto"
              />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-[var(--ink)] leading-tight">
                  Tell Us Who You Are
                </h1>
                <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium mt-1.5 leading-relaxed">
                  Choose whether you are a BUeño or a guest to continue with registration.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => handleTypeSelect('BUENO')}
                className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer text-left ${
                  isBueño
                    ? 'border-brand-orange bg-brand-orange/5 text-brand-orange shadow-sm font-bold'
                    : 'border-gray-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)] text-gray-700 dark:text-[var(--ink)] hover:border-gray-300 font-medium'
                }`}
              >
                <div>
                  <span className="block text-base">BUeño</span>
                  <span className="block text-xs font-normal text-gray-400 dark:text-[var(--muted)] mt-0.5">
                    Student, alumni, or faculty of Bicol University
                  </span>
                </div>
                {isBueño && (
                  <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-xs flex items-center justify-center font-bold shrink-0">
                    ✓
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleTypeSelect('GUEST')}
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
                  <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-xs flex items-center justify-center font-bold shrink-0">
                    ✓
                  </span>
                )}
              </button>
            </div>

            <Button
              type="button"
              onClick={handleProceedToForm}
              className="w-full h-12 rounded-xl font-semibold mt-4 shadow-md bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
            >
              Continue to Registration
            </Button>

            <p className="text-center text-sm text-gray-500 dark:text-[var(--muted)] font-medium pt-2 border-t border-gray-100 dark:border-[var(--line)]">
              Already have an account?{' '}
              <Link to="/signin" className="text-brand-orange font-semibold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        )}

        {/* FORM 2: ACTUAL SIGNUP FORM (Different form from the BUeño/Guest selection) */}
        {formStep === 1 && (
          <div className="bg-white dark:bg-[var(--surface)] sm:rounded-3xl sm:shadow-xl px-5 py-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between">
              {/* System Rule 69: Back button at top-left returns to BUeño/Guest selection */}
              <BackButton onClick={handleBackToTypeSelection} />
              <button
                type="button"
                onClick={handleBackToTypeSelection}
                className="text-xs font-semibold text-brand-orange hover:underline cursor-pointer"
              >
                Switch Account Type
              </button>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-[var(--ink)] leading-tight">
                Create {isBueño ? 'BUeño' : 'Guest'} Account
              </h1>
              <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium mt-1">
                {isBueño
                  ? 'Fill out your details and academic affiliation below.'
                  : 'Fill out your basic details below to get started.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4.5" noValidate>
              {/* ADDITIONAL FIELDS - EXCLUSIVE ONLY UPON SELECTION OF BUeño */}
              {isBueño && (
                <div className="space-y-4 p-4 bg-orange-50/40 dark:bg-[var(--tint-brand-bg)] border border-brand-orange/20 rounded-2xl animate-fade-in">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                    BUeño Affiliation Details
                  </h2>

                  {/* 1. Affiliation Category: Student, Alumni, or Faculty */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1.5">
                      I am a... <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Student', 'Alumni', 'Faculty'].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => updateForm({ role: r })}
                          className={`h-11 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center cursor-pointer ${
                            form.role === r
                              ? 'bg-brand-blue border-brand-blue text-white shadow-sm'
                              : 'border-gray-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface-2)] text-gray-700 dark:text-[var(--ink)] hover:border-gray-300'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    {fieldError('role', form.role, roleError)}
                  </div>

                  {/* 2. Complete Address */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                      Complete Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 123 Rizal St., Legazpi City, Albay"
                      value={form.address}
                      onChange={(e) => updateForm({ address: e.target.value })}
                      onBlur={() => touch('address')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all ${
                        touched.address && addressError
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
                      }`}
                    />
                    {fieldError('address', form.address, addressError)}
                  </div>

                  {/* 3. College Options (All latest list of colleges, institutes, and satellite campuses of Bicol University) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                      College / Institute / Satellite Campus <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.college}
                      onChange={(e) => {
                        updateForm({ college: e.target.value, course: '' })
                      }}
                      onBlur={() => touch('college')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer ${
                        touched.college && collegeError
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
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

                  {/* 4. Department Options (Automatically changes whenever college changes) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                      Department <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.course}
                      onChange={(e) => updateForm({ course: e.target.value })}
                      onBlur={() => touch('course')}
                      disabled={!form.college}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer disabled:opacity-50 ${
                        touched.course && departmentError
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
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
                </div>
              )}

              {/* BASIC DETAILS (Same for both BUeño and Guest) */}
              <div className="space-y-4">
                {/* Given Name & Surname */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="First Name"
                      value={form.firstName}
                      onChange={(e) => updateForm({ firstName: e.target.value })}
                      onBlur={() => touch('firstName')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all ${
                        touched.firstName && firstNameError
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
                      }`}
                    />
                    {fieldError('firstName', form.firstName, firstNameError)}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Last Name"
                      value={form.lastName}
                      onChange={(e) => updateForm({ lastName: e.target.value })}
                      onBlur={() => touch('lastName')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all ${
                        touched.lastName && lastNameError
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
                      }`}
                    />
                    {fieldError('lastName', form.lastName, lastNameError)}
                  </div>
                </div>

                {/* Username - NOT required */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                    Username <span className="text-gray-400 dark:text-[var(--muted)] font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter username (optional)"
                    value={form.username}
                    onChange={(e) => updateForm({ username: e.target.value })}
                    onBlur={() => touch('username')}
                    className="w-full h-11 px-3.5 border border-gray-200 dark:border-[var(--line)] rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all"
                  />
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="09123456789"
                    value={form.phone}
                    onChange={(e) => updateForm({ phone: e.target.value })}
                    onBlur={() => touch('phone')}
                    className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all ${
                      touched.phone && phoneError
                        ? 'border-red-400 focus:ring-red-200'
                        : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
                    }`}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-[var(--muted)] mt-1">
                    We'll send a verification code to this phone number.
                  </p>
                  {fieldError('phone', form.phone, phoneError)}
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder={isBueño ? 'user@bicol-u.edu.ph' : 'user@example.com'}
                    value={form.email}
                    onChange={(e) => updateForm({ email: e.target.value })}
                    onBlur={() => touch('email')}
                    className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all ${
                      touched.email && emailError
                        ? 'border-red-400 focus:ring-red-200'
                        : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
                    }`}
                  />
                  {isBueño && (
                    <p className="text-[11px] text-gray-400 dark:text-[var(--muted)] mt-1">
                      BUeños must use their official @bicol-u.edu.ph institutional email.
                    </p>
                  )}
                  {fieldError('email', form.email, emailError)}
                </div>

                {/* Password & Confirm Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => touch('password')}
                        className={`w-full h-11 px-3.5 pr-12 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all ${
                          touched.password && passwordError
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 hover:text-brand-orange"
                      >
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {fieldError('password', password, passwordError)}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-[var(--ink)] mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onBlur={() => touch('confirm')}
                        className={`w-full h-11 px-3.5 pr-12 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--ink)] transition-all ${
                          touched.confirm && confirmError
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-gray-200 dark:border-[var(--line)] focus:ring-brand-orange/30'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 hover:text-brand-orange"
                      >
                        {showConfirmPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {fieldError('confirm', confirmPassword, confirmError)}
                  </div>
                </div>

                {/* Terms and Privacy Checkbox */}
                <div>
                  <div className="flex items-start gap-2 pt-1">
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
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 rounded-xl font-semibold mt-4 shadow-md bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
              >
                {isSubmitting ? 'Creating account…' : 'Create Account'}
              </Button>

              {/* Sign In link */}
              <p className="text-center text-sm text-gray-500 dark:text-[var(--muted)] font-medium pt-2 border-t border-gray-100 dark:border-[var(--line)]">
                Already have an account?{' '}
                <Link to="/signin" className="text-brand-orange font-semibold hover:underline">
                  Sign In
                </Link>
              </p>
            </form>
          </div>
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
