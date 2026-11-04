import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import AuthLayout from '../components/layout/AuthLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import { updateCredentials } from '../services/auth.js'
import { passwordProblem, PASSWORD_HINT } from '../utils/passwordRules.js'

function ResetPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()
  const identifier = location.state?.identifier || ''
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  // Fields the user has typed in: their rules are checked live from then on.
  const [touched, setTouched] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function validate(values = form) {
    const next = {}
    const problem = passwordProblem(values.password)
    if (problem) next.password = problem
    if (values.password !== values.confirm) next.confirm = 'Passwords do not match'
    return next
  }

  function handleChange(e) {
    const { name, value } = e.target
    const nextForm = { ...form, [name]: value }
    const nextTouched = { ...touched, [name]: true }
    setForm(nextForm)
    setTouched(nextTouched)
    // Realtime validation: only fields already touched show their message.
    const all = validate(nextForm)
    setErrors(Object.fromEntries(Object.entries(all).filter(([key]) => nextTouched[key])))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validationErrors = validate()
    setTouched({ password: true, confirm: true })
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    if (!identifier) {
      showToast(
        'Reset session missing. Start again from the Forgot Password page.',
        'error'
      )
      navigate('/forgot-password')
      return
    }

    setIsSubmitting(true)
    const { error } = await updateCredentials({
      identifier,
      password: form.password,
    })
    setIsSubmitting(false)
    if (error) {
      showToast(error, 'error')
      return
    }
    showToast('Password updated. Please sign in with your new password.')
    navigate('/signin')
  }

  return (
    <AuthLayout panelTitle="Set a new password." panelSubtitle="Choose a strong password you haven't used before.">
      <PageHeader title="Reset Password" backTo="/forgot-password" />
      <div className="px-6 py-8 lg:py-10">
          <p className="text-sm text-gray-500 mb-6">Create a new password for your account.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder={PASSWORD_HINT}
                value={form.password}
                onChange={handleChange}
                error={errors.password}
              />
            </div>
            <Input
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              name="confirm"
              placeholder="Confirm new password"
              value={form.confirm}
              onChange={handleChange}
              error={errors.confirm}
            />

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="accent-brand-orange"
              />
              Show passwords
            </label>

            <Button type="submit" disabled={isSubmitting} className="w-full h-12 mt-2">
              {isSubmitting ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
      </div>
    </AuthLayout>
  )
}

export default ResetPassword
