import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import collegesData from '../data/colleges.json'
import backIcon from '../assets/icons/common/back.svg'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import OtpInput from '../components/ui/OtpInput.jsx'
import Button from '../components/ui/Button.jsx'
import AppShell from '../components/layout/AppShell.jsx'

function SignUp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { register } = useAuth()
  const { showToast } = useToast()

  const steps = [
    'role',
    'details',
    'password',
    'otp',
    'success',
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
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem('isko_signup_progress')
    return saved
      ? JSON.parse(saved)
      : {
          role: 'Student',
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          username: '',
          campus: '',
          college: '',
          course: '',
        }
  })

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)

  // OTP step timer
  const [otp, setOtp] = useState('')
  const [timer, setTimer] = useState(59)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Desktop specific personalization inputs
  const [desktopFullName, setDesktopFullName] = useState('')
  const [desktopYearBlock, setDesktopYearBlock] = useState('')

  // Dropdown options for mobile
  const [availableColleges, setAvailableColleges] = useState([])
  const [availableDepartments, setAvailableDepartments] = useState([])

  // Keep signup progress synced
  useEffect(() => {
    const { password: _, confirmPassword: __, ...persistForm } = form
    localStorage.setItem('isko_signup_progress', JSON.stringify(persistForm))
  }, [form])

  // Timer for OTP step
  useEffect(() => {
    if (step !== 3 || timer <= 0) return
    const interval = setInterval(() => {
      setTimer((t) => t - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [step, timer])

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
      setAvailableDepartments(collegeObj ? collegeObj.departments : [])
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
  const handleRoleNext = () => {
    if (!form.role) return
    goToStep(1)
  }

  const handleDetailsNext = (e) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName || !form.phone || !form.email || !form.username) {
      showToast('Please fill out all fields', 'error')
      return
    }
    goToStep(2)
  }

  const handlePasswordNext = (e) => {
    e.preventDefault()
    if (password.length < 8) {
      showToast('Password must be at least 8 characters', 'error')
      return
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error')
      return
    }
    if (!agreeToTerms) {
      showToast('You must agree to the Terms of Use', 'error')
      return
    }
    goToStep(3)
  }

  const handleOtpNext = (e) => {
    e.preventDefault()
    if (otp.length < 6) return
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      showToast('Phone verified!')
      goToStep(4) // success page
    }, 800)
  }

  const handleSuccessNext = () => {
    if (form.role === 'Student') {
      goToStep(5) // Academic details
    } else {
      goToStep(6) // Complete directly for Alumni/Faculty/Guest
    }
  }

  const handleCollegeNext = (e) => {
    e.preventDefault()
    if (!form.campus || !form.college || !form.course) {
      showToast('Please select your academic details', 'error')
      return
    }
    goToStep(6)
  }

  const handleCompleteNext = async () => {
    const { user, error } = await register({
      ...form,
      password,
    })
    if (error) {
      showToast(error, 'error')
      return
    }
    localStorage.removeItem('isko_signup_progress')
    localStorage.setItem('isko_device_verified', 'true')
    showToast('Registration complete! Welcome, Isko!')
    navigate('/home')
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const handleResend = () => {
    setTimer(59)
    setOtp('')
    showToast('A new 6-digit verification code has been sent!')
  }

  // Desktop Form Actions
  const handleDesktopRoleSelect = (role) => {
    updateForm({ role })
  }

  const handleDesktopRoleContinue = () => {
    if (!form.role) return
    // ALL roles proceed to credential details page
    goToStep(1)
  }

  const handleDesktopCredentialsSubmit = (e) => {
    e.preventDefault()
    if (!form.username || !form.phone || !form.email || password.length < 8 || password !== confirmPassword) {
      showToast('Please complete all credential fields correctly', 'error')
      return
    }
    goToStep(3) // Go to OTP verification
  }

  const handleDesktopPersonalizeSubmit = async (e) => {
    e.preventDefault()
    if (!desktopFullName.trim()) {
      showToast('Please enter your full name', 'error')
      return
    }

    if (form.role === 'Student' && (!form.college || !form.course || !desktopYearBlock.trim())) {
      showToast('Please fill out all academic details', 'error')
      return
    }

    const parts = desktopFullName.trim().split(' ')
    const first = parts[0]
    const last = parts.slice(1).join(' ') || 'User'

    const { user, error } = await register({
      ...form,
      firstName: first,
      lastName: last,
      campus: form.role === 'Student' ? 'Main Campus' : 'N/A',
      yearLevel: form.role === 'Student' ? desktopYearBlock.trim() : 'N/A',
      password,
    })

    if (error) {
      showToast(error, 'error')
      return
    }

    localStorage.removeItem('isko_signup_progress')
    localStorage.setItem('isko_device_verified', 'true')
    showToast('Registration complete! Welcome, Isko!')
    navigate('/home')
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
              <button
                type="button"
                onClick={handleBack}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <img src={backIcon} alt="Back" className="w-5 h-5" />
              </button>
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

            {/* STEP 0: Role Selection */}
            {step === 0 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 leading-tight">Tell us who you are</h1>
                  <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-wider">
                    Select your role to continue
                  </p>
                </div>

                <div className="space-y-3">
                  {['Student', 'Alumni', 'Faculty', 'Guest'].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => updateForm({ role })}
                      className={`w-full h-14 rounded-2xl border-2 flex items-center justify-between px-5 font-bold transition-all text-sm ${
                        form.role === role
                          ? 'border-brand-orange bg-brand-orange/5 text-brand-orange shadow-inner'
                          : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200'
                      }`}
                    >
                      <span>{role}</span>
                      {form.role === role && (
                        <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-[10px] flex items-center justify-center animate-scale-in">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <Button
                  onClick={handleRoleNext}
                  disabled={!form.role}
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
                        className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                      />
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
                        className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                      />
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
                      className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                    />
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
                      className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Username / Student ID
                    </label>
                    <input
                      type="text"
                      placeholder="Username"
                      value={form.username}
                      onChange={(e) => updateForm({ username: e.target.value })}
                      className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={!form.firstName || !form.lastName || !form.phone || !form.email} className="w-full h-12 rounded-full font-bold mt-2 shadow-md">
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
                        className="w-full h-11 px-3.5 pr-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                      />
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450">
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Confirm Password</label>
                    <input
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>

                  <div className="flex items-start gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="agree"
                      checked={agreeToTerms}
                      onChange={(e) => setAgreeToTerms(e.target.checked)}
                      className="mt-0.5"
                    />
                    <label htmlFor="agree" className="text-[11px] text-gray-400 font-medium leading-tight">
                      I agree to the Terms and Privacy.
                    </label>
                  </div>
                </div>

                <Button type="submit" disabled={password.length < 8 || password !== confirmPassword || !agreeToTerms} className="w-full h-12 rounded-full font-bold mt-2 shadow-md">
                  Create Account
                </Button>
              </form>
            )}

            {/* STEP 3: OTP */}
            {step === 3 && (
              <form onSubmit={handleOtpNext} className="space-y-6 animate-fade-in">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 leading-tight">Verify Phone</h1>
                </div>
                <p className="text-sm text-gray-500 font-medium">We sent a code to {form.phone}.</p>
                <OtpInput value={otp} onChange={setOtp} length={6} />
                <Button type="submit" disabled={otp.length < 6 || isSubmitting} className="w-full h-12 rounded-full font-bold shadow-md">
                  {isSubmitting ? 'Verifying...' : 'Continue'}
                </Button>
                <div className="text-center pt-2">
                  {timer > 0 ? (
                    <p className="text-xs text-gray-400 font-semibold">Resend code in <span className="text-brand-orange">{formatTime(timer)}</span></p>
                  ) : (
                    <button type="button" onClick={handleResend} className="text-xs text-brand-orange font-black">Resend code</button>
                  )}
                </div>
              </form>
            )}

            {/* STEP 4: Success */}
            {step === 4 && (
              <div className="text-center space-y-6 py-6 animate-fade-in">
                <div className="w-24 h-24 bg-brand-orange/10 rounded-full flex items-center justify-center mx-auto">
                  <img src={logo} alt="Tindahan ni Isko" className="w-16 animate-pulse" />
                </div>
                <h1 className="text-2xl font-black text-gray-900">Hey there, Isko!</h1>
                <p className="text-sm text-gray-500 font-medium">Account created successfully.</p>
                <Button onClick={handleSuccessNext} className="w-full h-12 rounded-full font-bold">Get Started</Button>
              </div>
            )}

            {/* STEP 5: College (Only shown for Student role) */}
            {step === 5 && (
              <form onSubmit={handleCollegeNext} className="space-y-5 animate-fade-in">
                <div className="flex justify-between items-start">
                  <h1 className="text-2xl font-black text-gray-900">Your College</h1>
                  <button type="button" onClick={() => goToStep(6)} className="text-xs font-black text-gray-400">Skip</button>
                </div>
                <div className="space-y-4">
                  <select value={form.campus} onChange={(e) => updateForm({ campus: e.target.value })} className="w-full h-11 px-3.5 border rounded-xl bg-white">
                    <option value="">Select Campus</option>
                    {collegesData.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <select value={form.college} onChange={(e) => updateForm({ college: e.target.value })} disabled={!form.campus} className="w-full h-11 px-3.5 border rounded-xl bg-white disabled:opacity-50">
                    <option value="">Select College</option>
                    {availableColleges.map((col) => <option key={col.id} value={col.name}>{col.name}</option>)}
                  </select>
                  <select value={form.course} onChange={(e) => updateForm({ course: e.target.value })} disabled={!form.college} className="w-full h-11 px-3.5 border rounded-xl bg-white disabled:opacity-50">
                    <option value="">Select Course</option>
                    {availableDepartments.map((dept, i) => <option key={i} value={dept}>{dept}</option>)}
                  </select>
                </div>
                <Button type="submit" disabled={!form.campus || !form.college || !form.course} className="w-full h-12 rounded-full font-bold">Next</Button>
              </form>
            )}

            {/* STEP 6: Complete */}
            {step === 6 && (
              <div className="text-center space-y-6 py-6 animate-fade-in">
                <div className="w-24 h-24 bg-brand-orange/10 rounded-full flex items-center justify-center mx-auto">
                  <img src={logo} alt="Tindahan ni Isko" className="w-16 animate-bounce" />
                </div>
                <h1 className="text-2xl font-black text-gray-900">All Set!</h1>
                <Button onClick={handleCompleteNext} className="w-full h-12 rounded-full font-bold">Start Shopping</Button>
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
                  <div className="grid grid-cols-2 gap-4">
                    {['Student', 'Faculty', 'Alumni', 'Guest'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleDesktopRoleSelect(role)}
                        className={`h-14 rounded-xl border font-bold text-sm transition-all flex items-center justify-center cursor-pointer ${
                          form.role === role
                            ? 'bg-brand-blue border-brand-blue text-white shadow-md'
                            : 'border-gray-250 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                onClick={handleDesktopRoleContinue}
                disabled={!form.role}
                className="w-full h-12 font-bold rounded-xl shadow-md mt-8 bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
              >
                Continue
              </Button>
            </div>
          )}

          {/* STEP 1 / Credentials Entry (Image 4 Wireframe with Phone & Email) */}
          {(step === 1 || step === 2 || (!location.pathname.includes('/signup/') && step !== 0 && step !== 3 && step !== 5)) && (
            <div className="p-10 animate-fade-in bg-white min-h-[540px] flex flex-col justify-between">
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-black text-gray-900 leading-tight">Sign Up</h1>
                  <p className="text-sm text-gray-500 font-medium mt-2 leading-relaxed">
                    Sign up to get started.
                  </p>
                </div>

                <form onSubmit={handleDesktopCredentialsSubmit} className="space-y-4">
                  {/* Username */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
                    <input
                      type="text"
                      placeholder="Enter username"
                      value={form.username}
                      onChange={(e) => updateForm({ username: e.target.value })}
                      className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
                      required
                    />
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="0912345678"
                      value={form.phone}
                      onChange={(e) => updateForm({ phone: e.target.value })}
                      className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
                      required
                    />
                    <p className="text-xs text-gray-400 mt-1.5 font-medium">
                      We'll send a verification code to this number.
                    </p>
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      placeholder="student@bicol-u.edu.ph"
                      value={form.email}
                      onChange={(e) => updateForm({ email: e.target.value })}
                      className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
                      required
                    />
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
                        className="w-full h-12 px-4 pr-12 border border-gray-250 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
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
                        className="w-full h-12 px-4 pr-12 border border-gray-250 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
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
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    disabled={!form.username || !form.phone || !form.email || password.length < 8 || password !== confirmPassword}
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

          {/* STEP 3 - OTP Verification (Desktop) */}
          {step === 3 && (
            <div className="p-10 animate-fade-in bg-white min-h-[500px] flex flex-col justify-between">
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-black text-gray-900 leading-tight">Verify Phone</h1>
                  <p className="text-sm text-gray-500 font-medium mt-2">
                    Enter the verification code sent to <span className="font-bold">{form.phone}</span>.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (otp.length === 6) {
                      showToast('Phone verified!')
                      goToStep(5) // Move to Personalization step
                    }
                  }}
                  className="space-y-6"
                >
                  <OtpInput value={otp} onChange={setOtp} length={6} />
                  <Button type="submit" disabled={otp.length < 6} className="w-full h-12 font-bold rounded-xl shadow-md mt-6 bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer">
                    Verify & Continue
                  </Button>
                </form>
              </div>

              <div className="text-center pt-8">
                {timer > 0 ? (
                  <p className="text-sm text-gray-500">Resend code in <span className="text-brand-orange font-bold">{formatTime(timer)}</span></p>
                ) : (
                  <button type="button" onClick={handleResend} className="text-sm text-brand-orange font-black hover:underline">
                    Resend Code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 5 - Personalization (Image 1: Hi, Isko!) */}
          {step === 5 && (
            <div className="p-10 animate-fade-in bg-white min-h-[520px] flex flex-col justify-between">
              <div>
                <div className="mb-6">
                  <h1 className="text-3xl font-black text-gray-900 leading-tight">
                    Hi, {form.username || 'Isko'}!
                  </h1>
                  <p className="text-sm text-gray-500 font-medium mt-2">
                    Just a few more details to personalize your shopping experience.
                  </p>
                </div>

                <form onSubmit={handleDesktopPersonalizeSubmit} className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                    <input
                      type="text"
                      placeholder="Enter your full name"
                      value={desktopFullName}
                      onChange={(e) => setDesktopFullName(e.target.value)}
                      className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
                      required
                    />
                  </div>

                  {/* Academic Details - ONLY shown if role is Student */}
                  {form.role === 'Student' && (
                    <>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Campus</label>
                        <select
                          value={form.campus}
                          onChange={(e) => updateForm({ campus: e.target.value })}
                          className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
                          required
                        >
                          <option value="">Select Campus</option>
                          {collegesData.map((c) => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">College/Institute</label>
                        <select
                          value={form.college}
                          onChange={(e) => updateForm({ college: e.target.value })}
                          disabled={!form.campus}
                          className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer disabled:opacity-50"
                          required
                        >
                          <option value="">Select College</option>
                          {availableColleges.map((col) => (
                            <option key={col.id} value={col.name}>{col.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Department</label>
                        <select
                          value={form.course}
                          onChange={(e) => updateForm({ course: e.target.value })}
                          disabled={!form.college}
                          className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer disabled:opacity-50"
                          required
                        >
                          <option value="">Select Department</option>
                          {availableDepartments.map((dept, i) => (
                            <option key={i} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Year and Block</label>
                        <input
                          type="text"
                          placeholder="e.g. 3rd Year - Block A"
                          value={desktopYearBlock}
                          onChange={(e) => setDesktopYearBlock(e.target.value)}
                          className="w-full h-12 px-4 border border-gray-250 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 bg-white"
                          required
                        />
                      </div>
                    </>
                  )}

                  <Button
                    type="submit"
                    disabled={!desktopFullName || (form.role === 'Student' && (!form.college || !form.course || !desktopYearBlock))}
                    className="w-full h-12 font-bold rounded-xl shadow-md mt-6 bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer"
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
