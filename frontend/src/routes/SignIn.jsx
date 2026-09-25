import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useApiWarmup } from '../hooks/useApi.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BackButton from '../components/ui/BackButton.jsx'

/**
 * Shown the instant Login is clicked, before the response lands. Keeps the
 * button's own space so the layout never jumps while the request is in flight.
 */
function AuthenticatingSkeleton() {
  return (
    <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
      Authenticating…
    </span>
  )
}

function SignIn() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { showToast } = useToast()
  // Fires on the first field focus: DNS + TCP + TLS to the API and the public
  // catalog read are done before the customer can possibly submit.
  const warmApi = useApiWarmup()

  const [form, setForm] = useState({
    phone: '',
    password: '',
  })

  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const phoneValid = form.phone.trim().length >= 10
  const passwordValid = form.password.length >= 8
  const formValid = phoneValid && passwordValid

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formValid) return

    setIsSubmitting(true)
    const { error } = await login(form.phone, form.password)
    setIsSubmitting(false)

    if (error) {
      setErrors({ form: error })
      showToast(error, 'error')
      return
    }

    showToast('Signed in successfully!')

    const isDeviceVerified = localStorage.getItem('isko_device_verified') === 'true'
    if (!isDeviceVerified) {
      navigate('/verify-otp', { state: { phone: form.phone, fromSignIn: true } })
    } else {
      navigate('/home')
    }
  }

  return (
    <AppShell showNav={false} showHeader={false} showBottomNav={false}>
      {/* MOBILE LOGIN LAYOUT */}
      <div className="flex flex-col justify-between min-h-[580px] p-8 md:hidden animate-fade-in">
        <div>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sign In</h1>
            <BackButton to="/home" label="Back to Homepage" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Phone Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  name="phone"
                  placeholder="Enter phone number"
                  value={form.phone}
                  onChange={handleChange}
                  onFocus={warmApi}
                  className={`w-full h-12 px-4 pr-12 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all ${
                    errors.phone ? 'border-red-400' : 'border-gray-200'
                  }`}
                />
                {phoneValid && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#16A34A] text-white text-xs font-black animate-scale-in">
                    ✓
                  </span>
                )}
              </div>
              {errors.phone && <p className="text-red-500 text-xs mt-1 font-semibold">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter password"
                  value={form.password}
                  onChange={handleChange}
                  onFocus={warmApi}
                  className={`w-full h-12 px-4 pr-12 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                    form.password.length > 0 && !passwordValid
                      ? 'border-red-400 focus:ring-red-250 focus:border-red-500'
                      : 'border-gray-200 focus:ring-brand-orange/40 focus:border-brand-orange'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450 hover:text-brand-orange transition-colors"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-gray-400 font-medium"></span>
              <Link
                to="/forgot-password"
                className="text-sm text-gray-400 hover:text-brand-orange font-bold transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {errors.form && <p className="text-red-500 text-sm font-semibold">{errors.form}</p>}

            <button
              type="submit"
              disabled={!formValid || isSubmitting}
              className={`w-full h-12 text-white font-bold rounded-full transition-all shadow-md hover:shadow-lg active:scale-98 mt-6 ${
                formValid
                  ? 'bg-brand-orange hover:bg-brand-orange-dark cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isSubmitting ? <AuthenticatingSkeleton /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 font-semibold pt-6">
          Don't have an account?{' '}
          <Link to="/signup/role" className="text-brand-orange font-bold hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      {/* DESKTOP LOGIN LAYOUT (Image 3 Wireframe) */}
      <div className="hidden md:flex flex-col justify-between min-h-[460px] p-10 animate-fade-in bg-white">
        <div>
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-gray-900 leading-tight">Log In</h1>
              <p className="text-sm text-gray-500 font-medium mt-2 leading-relaxed">
                Access your tasks, notes, and projects anytime, anywhere.
              </p>
            </div>
            <BackButton to="/home" label="Back to Homepage" className="shrink-0 mt-1" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                placeholder="0912345678"
                value={form.phone}
                onChange={handleChange}
                onFocus={warmApi}
                className="w-full h-12 px-4 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange bg-white transition-all"
              />
              <p className="text-xs text-gray-400 mt-2 font-medium">
                We'll send a verification code to this number.
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleChange}
                  onFocus={warmApi}
                  className="w-full h-12 px-4 pr-12 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450 hover:text-brand-orange transition-colors"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {errors.form && <p className="text-red-500 text-sm font-semibold">{errors.form}</p>}

            <button
              type="submit"
              disabled={!formValid || isSubmitting}
              className={`w-full h-12 text-white font-bold rounded-lg transition-all shadow-md active:scale-98 mt-6 cursor-pointer ${
                formValid
                  ? 'bg-brand-orange hover:bg-brand-orange-dark'
                  : 'bg-brand-orange opacity-90'
              }`}
            >
              {isSubmitting ? <AuthenticatingSkeleton /> : 'Log In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 font-semibold pt-8">
          Don't have an account?{' '}
          <Link to="/signup/role" className="text-brand-orange font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </AppShell>
  )
}

export default SignIn

