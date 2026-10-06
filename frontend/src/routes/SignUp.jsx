import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import collegesData from '../data/colleges.json'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import Button from '../components/ui/Button.jsx'
import AppShell from '../components/layout/AppShell.jsx'
import BackButton from '../components/ui/BackButton.jsx'

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
  backgroundPosition: 'right 16px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '18px'
}

function SignUp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { register } = useAuth()
  const { showToast } = useToast()

  const steps = [
    'role',
    'details',
    'password',
    'college',
    'complete'
  ]

  const getStepIndex = (pathname) => {
    const part = pathname.split('/').pop()
    const idx = steps.indexOf(part)
    return idx > -1 ? idx : 0
  }

  const step = getStepIndex(location.pathname)

  // Initial State from localStorage
  // Guarded like every other storage read in the app: this initializer runs
  // during render, so one unparsable value would blank the whole page.
  const [form, setForm] = useState(() => {
    const defaults = {
      // FLOW-CUST_SIGNUP-02: the "cust_type" is chosen on the first step,
      // never assumed - '' until Customer X picks "BUeño" or "guest".
      custType: '',
      // cust_categ (FLOW-CUST_SIGNUP-03): Student | Alumni | Faculty for a
      // BUeño; the literal "Guest" marks the guest account type.
      role: '',
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      username: '',
      campus: '',
      college: '',
      course: '',
      yearLevel: '',
      block: '',
    }
    let stored
    try {
      stored = JSON.parse(localStorage.getItem('isko_signup_progress')) || {}
    } catch {
      stored = {}
    }
    if (typeof stored !== 'object' || Array.isArray(stored)) stored = {}
    // Drafts from before the account-type step only carry `role`, so the
    // cust_type it implies is derived and the signup resumes where it was.
    if (stored.custType !== 'BUENO' && stored.custType !== 'GUEST') {
      stored.custType = stored.role === 'Guest' ? 'GUEST' : stored.role ? 'BUENO' : ''
    }
    if (stored.custType === 'GUEST') stored.role = 'Guest'
    return { ...defaults, ...stored }
  })

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)

  // FLOW-CUST_SIGNUP-02/03: the "BUeño" account type carries the academic
  // affiliation (cust_categ, cust_college, cust_dept); FLOW-CUST_SIGNUP-04
  // leaves all three NULL for a "guest", so the academic step belongs to
  // everyone except a guest.
  const isBueño = form.custType !== 'GUEST'

  // REQ-CUST_SIGNUP-02: a BUeño signs up with a Bicol University address.
  const BU_EMAIL_RE = /^[^\s@]+@bicol-u\.edu\.ph$/i

  const [isSubmitting, setIsSubmitting] = useState(false)

  // SYSTEM RULES 66 / 67: validation runs in real time and every invalid
  // message shows below (or beside) the form field it belongs to.
  const [touched, setTouched] = useState({})
  const touch = (field) => setTouched((prev) => ({ ...prev, [field]: true }))
  const touchAll = (fields) =>
    setTouched((prev) => {
      const next = { ...prev }
      fields.forEach((field) => { next[field] = true })
      return next
    })

  // A message renders while its field holds invalid content (real time),
  // stays up once the field has been visited, and clears the instant the
  // input becomes valid again - never a permanent red field.
  const fieldError = (field, value, message) =>
    message && (touched[field] || (value ?? '') !== '') ? (
      <p className="text-red-500 text-[11px] font-semibold mt-1">{message}</p>
    ) : null

  // REQ-CUST_SIGNUP-01: every required field is validated before the form
  // may move on. FLOW-CUST_SIGNUP-07: the phone has to hold a valid format
  // - the same 10-to-11 digit rule the backend enforces, so both sides
  // always agree.
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
  // Kept as the live-content flag: it tints the field and blocks submit
  // only while the typed value itself is wrong (REQ-CUST_SIGNUP-02).
  const emailLooksWrong = emailError !== '' && emailValue !== ''

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

  // FLOW-CUST_SIGNUP-03: a BUeño still owes the academic details; a guest
  // (FLOW-CUST_SIGNUP-04) never sees this step.
  const campusError = form.campus ? '' : 'Campus is required.'
  const collegeError = form.college ? '' : 'College or institute is required.'
  const courseError = form.course ? '' : 'Department or program is required.'
  const yearLevelError = form.yearLevel ? '' : 'Year level is required.'
  const academicErrors = [campusError, collegeError, courseError, yearLevelError].some(Boolean)

  // Dropdown options for mobile
  const [availableColleges, setAvailableColleges] = useState([])
  const [availableDepartments, setAvailableDepartments] = useState([])

  // Keep signup progress synced (passwords live in their own state, never in `form`)
  useEffect(() => {
    localStorage.setItem('isko_signup_progress', JSON.stringify(form))
  }, [form])

  // Sync colleges data when campus changes
  useEffect(() => {
    if (form.campus) {
      const campusObj = collegesData.find((c) => c.name === form.campus)
      setAvailableColleges(campusObj ? campusObj.colleges : [])
      setAvailableDepartments([])
      setForm((prev) => ({ ...prev, college: '', course: '' }))
    } else {
      setAvailableColleges([])
      setAvailableDepartments([])
    }
  }, [form.campus])

  // Sync departments when college changes
  useEffect(() => {
    if (form.college && availableColleges.length > 0) {
      const collegeObj = availableColleges.find((col) => col.name === form.college)
      setAvailableDepartments(collegeObj ? collegeObj.programs : [])
      setForm((prev) => ({ ...prev, course: '' }))
    } else {
      setAvailableDepartments([])
    }
  }, [form.college, availableColleges])

  const updateForm = (fields) => {
    setForm((prev) => ({ ...prev, ...fields }))
  }

  // Navigation handlers
  const goToStep = (idx) => {
    navigate(`/signup/${steps[idx]}`)
  }

  const handleBack = () => {
    if (step > 0) {
      goToStep(step - 1)
    } else {
      navigate('/')
    }
  }

  // Mobile Handlers
  // FLOW-CUST_SIGNUP-02: the first pick is the account type itself -
  // "BUeño" or "guest". Picking "guest" clears the affiliation (guests
  // carry no cust_categ), picking "BUeño" then asks for cust_categ.
  const handleTypeSelect = (type) => {
    if (type === 'GUEST') {
      updateForm({ custType: 'GUEST', role: 'Guest' })
      return
    }
    updateForm({
      custType: 'BUENO',
      role: ['Student', 'Alumni', 'Faculty'].includes(form.role) ? form.role : '',
    })
  }

  // FLOW-CUST_SIGNUP-02/03: the account type must be chosen, and a BUeño
  // must also specify cust_categ before the signup may continue.
  const roleReady =
    form.custType === 'GUEST' ||
    (form.custType === 'BUENO' && ['Student', 'Alumni', 'Faculty'].includes(form.role))

  const handleRoleNext = () => {
    if (!roleReady) return
    goToStep(1)
  }

  const handleDetailsNext = (e) => {
    e.preventDefault()
    // The messages below each field are what report the problem (rules
    // 66/67); touching every field makes sure none of them is missed.
    touchAll(['firstName', 'lastName', 'phone', 'email', 'username'])
    // REQ-CUST_SIGNUP-01: nothing advances until every field validates.
    if (firstNameError || lastNameError || phoneError || emailError || !form.username) return
    goToStep(2)
  }

  const handlePasswordNext = (e) => {
    e.preventDefault()
    touchAll(['password', 'confirm', 'terms'])
    if (passwordError || confirmError || !agreeToTerms) return
    // FLOW-CUST_SIGNUP-03: a BUeño still owes the academic details; a guest
    // (FLOW-CUST_SIGNUP-04) can submit right away.
    if (isBueño) {
      goToStep(3)
      return
    }
    submitRegistration()
  }

  const handleCollegeNext = async (e) => {
    e.preventDefault()
    touchAll(['campus', 'college', 'course', 'yearLevel'])
    if (academicErrors) return
    await submitRegistration()
  }

  /**
   * FLOW-CUST_SIGNUP-05: submitting creates the row but does NOT finalize it
   * - the answer carries the signed challenge and the customer is taken to
   * the OTP screen, which is what turns the account live.
   */
  const submitRegistration = async () => {
    setIsSubmitting(true)
    const combinedYearLevel = isBueño
      ? (form.block ? `${form.yearLevel} - Block ${form.block}` : form.yearLevel)
      : ''
    const registrationDetails = {
      ...form,
      yearLevel: combinedYearLevel,
      password,
    }
    if (!isBueño) {
      // FLOW-CUST_SIGNUP-04: no university affiliation for a guest.
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

    // No challenge came back (the backend already finalized): land on sign-in.
    showToast('Registration complete! Please sign in.')
    navigate('/signin')
  }

  // Desktop Form Actions
  const handleDesktopRoleContinue = () => {
    // Same gate as mobile: FLOW-CUST_SIGNUP-02 (account type chosen) plus
    // FLOW-CUST_SIGNUP-03 (cust_categ specified for a BUeño).
    if (!roleReady) return
    // ALL account types proceed to credential details page
    goToStep(1)
  }

  const handleDesktopCredentialsSubmit = (e) => {
    e.preventDefault()
    touchAll(['firstName', 'lastName', 'username', 'phone', 'email', 'password', 'confirm', 'terms'])
    // REQ-CUST_SIGNUP-01: every field has to validate before continuing -
    // the inline messages below the fields report which one does not.
    if (
      firstNameError || lastNameError || !form.username ||
      phoneError || emailError || passwordError || confirmError || !agreeToTerms
    ) {
      return
    }
    // FLOW-CUST_SIGNUP-03 / -04: only a BUeño still has the academic step.
    if (isBueño) {
      goToStep(3)
      return
    }
    submitRegistration()
  }

  const handleDesktopPersonalizeSubmit = async (e) => {
    e.preventDefault()

    // FLOW-CUST_SIGNUP-03: every BUeño owes the academic details.
    touchAll(['campus', 'college', 'course', 'yearLevel'])
    if (isBueño && academicErrors) return

    updateForm({ firstName: form.firstName.trim(), lastName: form.lastName.trim() })
    await submitRegistration()
  }

  return (
    <>
      {/* ────────────────── MOBILE SIGNUP FLOW ────────────────── */}
      <div className="md:hidden min-h-dvh bg-gray-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-25%] left-[-25%] w-[70%] aspect-square rounded-full bg-brand-orange/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-25%] right-[-25%] w-[70%] aspect-square rounded-full bg-brand-blue/5 blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm bg-white rounded-3xl border border-gray-100 shadow-xl p-8 flex flex-col justify-between min-h-[580px] z-10 animate-fade-in relative">
          <div>
            <div className="flex items-center justify-between mb-8">
              <BackButton onClick={handleBack} label="Back" className="w-10 justify-center" />
              <div className="flex gap-1.5 w-32 justify-end">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      i <= step ? 'bg-brand-orange' : 'bg-gray-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* STEP 0: Account type (FLOW-CUST_SIGNUP-02) + cust_categ (FLOW-CUST_SIGNUP-03) */}
            {step === 0 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 leading-tight">Tell us who you are</h1>
                  <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-wider">
                    Choose &quot;BUeño&quot; or &quot;guest&quot;
                  </p>
                </div>

                {/* FLOW-CUST_SIGNUP-02: cust_type is either "BUeño" or "guest" */}
                <div className="space-y-3">
                  {[
                    { type: 'BUENO', label: 'BUeño', hint: 'Student, alumni, or faculty of Bicol University' },
                    { type: 'GUEST', label: 'Guest', hint: 'No university affiliation' },
                  ].map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => handleTypeSelect(option.type)}
                      className={`w-full min-h-14 rounded-2xl border-2 flex items-center justify-between px-5 py-3 font-bold transition-all text-sm ${
                        form.custType === option.type
                          ? 'border-brand-orange bg-brand-orange/5 text-brand-orange shadow-inner'
                          : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200'
                      }`}
                    >
                      <span className="text-left">
                        <span className="block">{option.label}</span>
                        <span className="block text-[11px] font-medium text-gray-400">{option.hint}</span>
                      </span>
                      {form.custType === option.type && (
                        <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-[10px] flex items-center justify-center animate-scale-in">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* FLOW-CUST_SIGNUP-03: a BUeño also specifies cust_categ */}
                {form.custType === 'BUENO' && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                      I am a...
                    </p>
                    <div className="flex gap-2">
                      {['Student', 'Alumni', 'Faculty'].map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => updateForm({ role })}
                          className={`flex-1 h-11 rounded-xl border-2 font-bold transition-all text-xs ${
                            form.role === role
                              ? 'border-brand-orange bg-brand-orange/5 text-brand-orange'
                              : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleRoleNext}
                  disabled={!roleReady}
                  className="w-full h-12 rounded-full font-bold shadow-md mt-6"
                >
                  Next
                </Button>
              </div>
            )}

            {/* STEP 1: Details */}
            {step === 1 && (
              <form onSubmit={handleDetailsNext} className="space-y-5 animate-fade-in">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 leading-tight">Create Account</h1>
                  <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-wider">
                    Provide your basic details
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        First Name
                      </label>
                      <input
                        type="text"
                        placeholder="First Name"
                        value={form.firstName}
                        onChange={(e) => updateForm({ firstName: e.target.value })}
                        onBlur={() => touch('firstName')}
                        className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                      />
                      {fieldError('firstName', form.firstName, firstNameError)}
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Last Name
                      </label>
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={form.lastName}
                        onChange={(e) => updateForm({ lastName: e.target.value })}
                        onBlur={() => touch('lastName')}
                        className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                      />
                      {fieldError('lastName', form.lastName, lastNameError)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="Enter phone number"
                      value={form.phone}
                      onChange={(e) => updateForm({ phone: e.target.value })}
                      onBlur={() => touch('phone')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 ${
                        phoneError && phoneDigits ? 'border-red-400' : 'border-gray-200'
                      }`}
                    />
                    {fieldError('phone', form.phone, phoneError)}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="student@bicol-u.edu.ph"
                      value={form.email}
                      onChange={(e) => updateForm({ email: e.target.value })}
                      onBlur={() => touch('email')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 ${
                        emailLooksWrong ? 'border-red-400' : 'border-gray-200'
                      }`}
                    />
                    {fieldError('email', form.email, emailError)}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      placeholder="Username"
                      value={form.username}
                      onChange={(e) => updateForm({ username: e.target.value })}
                      onBlur={() => touch('username')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 ${
                        touched.username && !form.username ? 'border-red-400' : 'border-gray-200'
                      }`}
                    />
                    {fieldError('username', form.username, form.username ? '' : 'Username is required.')}
                  </div>
                </div>

                <Button type="submit" disabled={!!(firstNameError || lastNameError || phoneError || emailError) || !form.username} className="w-full h-12 rounded-full font-bold mt-2 shadow-md">
                  Continue
                </Button>
              </form>
            )}

            {/* STEP 2: Password */}
            {step === 2 && (
              <form onSubmit={handlePasswordNext} className="space-y-5 animate-fade-in">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 leading-tight">Secure Account</h1>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Password</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => touch('password')}
                        className="w-full h-11 px-3.5 pr-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                      />
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450">
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {fieldError('password', password, passwordError)}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Confirm Password</label>
                    <input
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => touch('confirm')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
                        confirmError && confirmPassword ? 'border-red-400' : 'border-gray-200'
                      }`}
                    />
                    {fieldError('confirm', confirmPassword, confirmError)}
                  </div>

                  <div>
                    <div className="flex items-start gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="agree"
                        checked={agreeToTerms}
                        onChange={(e) => {
                          setAgreeToTerms(e.target.checked)
                          touch('terms')
                        }}
                        className="mt-0.5"
                      />
                      <label htmlFor="agree" className="text-[11px] text-gray-400 font-medium leading-tight">
                        I agree to the Terms and Privacy.
                      </label>
                    </div>
                    {fieldError('terms', agreeToTerms ? 'yes' : '', termsError)}
                  </div>
                </div>

                <Button type="submit" disabled={!!(passwordError || confirmError) || !agreeToTerms} className="w-full h-12 rounded-full font-bold mt-2 shadow-md">
                  {isBueño ? 'Continue' : 'Create Account'}
                </Button>
              </form>
            )}

            {/* STEP 3: Academic details - every BUeño (FLOW-CUST_SIGNUP-03) */}
            {step === 3 && isBueño && (
              <form onSubmit={handleCollegeNext} className="space-y-5 animate-fade-in">
                <div className="flex justify-between items-start">
                  <h1 className="text-2xl font-black text-gray-900">Your College</h1>
                </div>
                <div className="space-y-4">
                  <div>
                    <select
                      value={form.campus}
                      onChange={(e) => updateForm({ campus: e.target.value })}
                      onBlur={() => touch('campus')}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer ${touched.campus && campusError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                      style={selectStyle}
                    >
                      <option value="">Select Campus</option>
                      {collegesData.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    {fieldError('campus', form.campus, campusError)}
                  </div>
                  <div>
                    <select
                      value={form.college}
                      onChange={(e) => updateForm({ college: e.target.value })}
                      onBlur={() => touch('college')}
                      disabled={!form.campus}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 cursor-pointer disabled:opacity-50 transition-all appearance-none ${touched.college && collegeError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                      style={selectStyle}
                    >
                      <option value="">Select College</option>
                      {availableColleges.map((col) => <option key={col.id} value={col.name}>{col.name}</option>)}
                    </select>
                    {fieldError('college', form.college, collegeError)}
                  </div>
                  <div>
                    <select
                      value={form.course}
                      onChange={(e) => updateForm({ course: e.target.value })}
                      onBlur={() => touch('course')}
                      disabled={!form.college}
                      className={`w-full h-11 px-3.5 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 cursor-pointer disabled:opacity-50 transition-all appearance-none ${touched.course && courseError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                      style={selectStyle}
                    >
                      <option value="">Select Course</option>
                      {availableDepartments.map((dept, i) => <option key={i} value={dept}>{dept}</option>)}
                    </select>
                    {fieldError('course', form.course, courseError)}
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <select
                        value={form.yearLevel}
                        onChange={(e) => updateForm({ yearLevel: e.target.value })}
                        onBlur={() => touch('yearLevel')}
                        className={`w-full h-11 px-3.5 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer ${touched.yearLevel && yearLevelError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                        style={selectStyle}
                      >
                        <option value="">Select Year</option>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                        <option value="5th Year +">5th Year +</option>
                      </select>
                      {fieldError('yearLevel', form.yearLevel, yearLevelError)}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Block (Optional)"
                        value={form.block}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          if (val === '' || /^[A-Z]$/.test(val)) {
                            updateForm({ block: val });
                          }
                        }}
                        className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 bg-white"
                      />
                    </div>
                  </div>
                </div>
                <Button type="submit" disabled={academicErrors || isSubmitting} className="w-full h-12 rounded-full font-bold">
                  {isSubmitting ? 'Creating account…' : 'Create Account'}
                </Button>
              </form>
            )}

            {/* STEP 4: Complete */}
            {step === 4 && (
              <div className="text-center space-y-6 py-6 animate-fade-in">
                <div className="w-24 h-24 bg-brand-orange/10 rounded-full flex items-center justify-center mx-auto">
                  <img src={logo} alt="Tindahan ni Isko" className="w-16 animate-bounce" />
                </div>
                <h1 className="text-2xl font-black text-gray-900">All Set!</h1>
                <Button onClick={() => navigate('/signin')} className="w-full h-12 rounded-full font-bold">Go to Sign In</Button>
              </div>
            )}
          </div>

          {step <= 2 && (
            <p className="text-center text-sm text-gray-400 font-semibold pt-6">
              Already have an account? <Link to="/signin" className="text-brand-orange font-bold">Sign in</Link>
            </p>
          )}
        </div>
      </div>

      {/* ────────────────── DESKTOP SIGNUP FLOW ────────────────── */}
      <div className="hidden md:block">
        <AppShell showNav={false}>
          {/* STEP 0 - Tell Us More About You (Image 2) */}
          {step === 0 && (
            <div className="p-10 animate-fade-in bg-white min-h-[460px] flex flex-col justify-between">
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-black text-gray-900 leading-tight">Tell Us More About You</h1>
                  <p className="text-sm text-gray-500 font-medium mt-2">
                    Just a few more details to personalize your shopping experience.
                  </p>
                </div>

                <div className="space-y-6">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">I am a...</h2>

                  {/* FLOW-CUST_SIGNUP-02: cust_type is either "BUeño" or "guest" */}
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { type: 'BUENO', label: 'BUeño', hint: 'Student, alumni, or faculty of Bicol University' },
                      { type: 'GUEST', label: 'Guest', hint: 'No university affiliation' },
                    ].map((option) => (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => handleTypeSelect(option.type)}
                        className={`min-h-14 rounded-xl border-2 flex flex-col items-start justify-center px-4 py-3 font-bold transition-all text-sm cursor-pointer ${
                          form.custType === option.type
                            ? 'border-brand-orange bg-brand-orange/5 text-brand-orange shadow-md'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        <span className="text-left">
                          <span className="block">{option.label}</span>
                          <span className="block text-[11px] font-medium text-gray-400">{option.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* FLOW-CUST_SIGNUP-03: a BUeño also specifies cust_categ */}
                  {form.custType === 'BUENO' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-4">
                        {['Student', 'Alumni', 'Faculty'].map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => updateForm({ role })}
                            className={`h-14 rounded-xl border font-bold text-sm transition-all flex items-center justify-center cursor-pointer ${
                              form.role === role
                                ? 'bg-brand-blue border-brand-blue text-white shadow-md'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleDesktopRoleContinue}
                disabled={!roleReady}
                className="w-full h-12 font-bold rounded-xl shadow-md mt-8 bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
              >
                Continue
              </Button>
            </div>
          )}

          {/* STEP 1 / Credentials Entry (Image 4 Wireframe with Phone & Email) */}
          {(step === 1 || step === 2) && (
            <div className="p-10 animate-fade-in bg-white min-h-[540px] flex flex-col justify-between">
              <div>
                <BackButton onClick={handleBack} label="Back to Role Selection" className="mb-6" />
                <div className="mb-8">
                  <h1 className="text-3xl font-black text-gray-900 leading-tight">Sign Up</h1>
                  <p className="text-sm text-gray-500 font-medium mt-2 leading-relaxed">
                    Sign up to get started.
                  </p>
                </div>

                <form onSubmit={handleDesktopCredentialsSubmit} className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-gray-700 mb-2">First Name</label>
                      <input
                        type="text"
                        placeholder="First Name"
                        value={form.firstName}
                        onChange={(e) => updateForm({ firstName: e.target.value })}
                        onBlur={() => touch('firstName')}
                        className={`w-full h-12 px-4 border rounded-xl text-sm placeholder-gray-400 focus:outline-none bg-white ${touched.firstName && firstNameError ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-gray-200'}`}
                        required
                      />
                      {fieldError('firstName', form.firstName, firstNameError)}
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-gray-700 mb-2">Last Name</label>
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={form.lastName}
                        onChange={(e) => updateForm({ lastName: e.target.value })}
                        onBlur={() => touch('lastName')}
                        className={`w-full h-12 px-4 border rounded-xl text-sm placeholder-gray-400 focus:outline-none bg-white ${touched.lastName && lastNameError ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-gray-200'}`}
                        required
                      />
                      {fieldError('lastName', form.lastName, lastNameError)}
                    </div>
                  </div>

                  {/* Username */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
                    <input
                      type="text"
                      placeholder="Enter username"
                      value={form.username}
                      onChange={(e) => updateForm({ username: e.target.value })}
                      onBlur={() => touch('username')}
                      className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
                      required
                    />
                    {fieldError('username', form.username, form.username ? '' : 'Username is required.')}
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="0912345678"
                      value={form.phone}
                      onChange={(e) => updateForm({ phone: e.target.value })}
                      onBlur={() => touch('phone')}
                      className={`w-full h-12 px-4 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white ${touched.phone && phoneError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                      required
                    />
                    <p className="text-xs text-gray-400 mt-1.5 font-medium">
                      We'll send a verification code to this number.
                    </p>
                    {fieldError('phone', form.phone, phoneError)}
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      placeholder="student@bicol-u.edu.ph"
                      value={form.email}
                      onChange={(e) => updateForm({ email: e.target.value })}
                      onBlur={() => touch('email')}
                      className={`w-full h-12 px-4 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white ${touched.email && emailError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                      required
                    />
                    {fieldError('email', form.email, emailError)}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        placeholder="Create password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => touch('password')}
                        className={`w-full h-12 px-4 pr-12 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white ${touched.password && passwordError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450 hover:text-brand-orange"
                      >
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {fieldError('password', password, passwordError)}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onBlur={() => touch('confirm')}
                        className={`w-full h-12 px-4 pr-12 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white ${touched.confirm && confirmError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450 hover:text-brand-orange"
                      >
                        {showConfirmPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {fieldError('confirm', confirmPassword, confirmError)}
                  </div>

                  {/* Terms and Privacy - same agreement the mobile form collects */}
                  <div>
                    <div className="flex items-start gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="agree-desktop"
                        checked={agreeToTerms}
                        onChange={(e) => {
                          setAgreeToTerms(e.target.checked)
                          touch('terms')
                        }}
                        className="mt-0.5"
                      />
                      <label htmlFor="agree-desktop" className="text-xs text-gray-400 font-medium leading-tight">
                        I agree to the Terms and Privacy.
                      </label>
                    </div>
                    {fieldError('terms', agreeToTerms ? 'yes' : '', termsError)}
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    disabled={
                      !!(
                        firstNameError || lastNameError || !form.username ||
                        phoneError || emailError || passwordError || confirmError ||
                        !agreeToTerms
                      )
                    }
                    className="w-full h-12 font-bold rounded-xl shadow-md mt-6 bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
                  >
                    Sign Up
                  </Button>
                </form>
              </div>

              <p className="text-center text-sm text-gray-500 font-semibold pt-6">
                Already have an account?{' '}
                <Link to="/signin" className="text-brand-orange font-bold hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          )}

          {/* STEP 3 - Academic details for every BUeño (FLOW-CUST_SIGNUP-03) */}
          {step === 3 && isBueño && (
            <div className="p-10 animate-fade-in bg-white min-h-[520px] flex flex-col justify-between">
              <div>
                <BackButton onClick={handleBack} label="Back to Password" className="mb-6" />
                <div className="mb-6">
                  <h1 className="page-title text-gray-900">Academic Details</h1>
                  <p className="text-sm text-gray-500 font-medium mt-2">
                    Tell us your campus, college, department, and year.
                  </p>
                </div>

                <form onSubmit={handleDesktopPersonalizeSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Campus</label>
                        <select
                          value={form.campus}
                          onChange={(e) => updateForm({ campus: e.target.value })}
                          onBlur={() => touch('campus')}
                          className={`w-full h-12 px-4 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer ${touched.campus && campusError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                          style={selectStyle}
                        >
                          <option value="">Select Campus</option>
                          {collegesData.map((c) => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                        {fieldError('campus', form.campus, campusError)}
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">College/Institute</label>
                        <select
                          value={form.college}
                          onChange={(e) => updateForm({ college: e.target.value })}
                          onBlur={() => touch('college')}
                          disabled={!form.campus}
                          className={`w-full h-12 px-4 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer disabled:opacity-50 ${touched.college && collegeError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                          style={selectStyle}
                        >
                          <option value="">Select College</option>
                          {availableColleges.map((col) => (
                            <option key={col.id} value={col.name}>{col.name}</option>
                          ))}
                        </select>
                        {fieldError('college', form.college, collegeError)}
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Department</label>
                        <select
                          value={form.course}
                          onChange={(e) => updateForm({ course: e.target.value })}
                          onBlur={() => touch('course')}
                          disabled={!form.college}
                          className={`w-full h-12 px-4 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer disabled:opacity-50 ${touched.course && courseError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                          style={selectStyle}
                        >
                          <option value="">Select Department</option>
                          {availableDepartments.map((dept, i) => (
                            <option key={i} value={dept}>{dept}</option>
                          ))}
                        </select>
                        {fieldError('course', form.course, courseError)}
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-gray-700 mb-2">Year</label>
                          <select
                            value={form.yearLevel}
                            onChange={(e) => updateForm({ yearLevel: e.target.value })}
                            onBlur={() => touch('yearLevel')}
                            className={`w-full h-12 px-4 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer ${touched.yearLevel && yearLevelError ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-orange/30'}`}
                            style={selectStyle}
                          >
                            <option value="">Select Year</option>
                            <option value="1st Year">1st Year</option>
                            <option value="2nd Year">2nd Year</option>
                            <option value="3rd Year">3rd Year</option>
                            <option value="4th Year">4th Year</option>
                            <option value="5th Year +">5th Year +</option>
                          </select>
                          {fieldError('yearLevel', form.yearLevel, yearLevelError)}
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-gray-700 mb-2">Block (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. A"
                            value={form.block}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              if (val === '' || /^[A-Z]$/.test(val)) {
                                updateForm({ block: val });
                              }
                            }}
                            className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
                          />
                        </div>
                      </div>

                  <Button
                    type="submit"
                    disabled={academicErrors}
                    className="w-full h-12 font-bold rounded-xl mt-6 bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
                  >
                    Finish
                  </Button>
                </form>
              </div>

              <p className="text-center text-sm text-gray-500 font-semibold pt-6">
                Already have an account?{' '}
                <Link to="/signin" className="text-brand-orange font-bold hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          )}
        </AppShell>
      </div>
    </>
  )
}

export default SignUp

