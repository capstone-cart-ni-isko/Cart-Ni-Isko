import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../components/layout/AuthLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'

function ResetPassword() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function validate() {
    const next = {}
    if (form.password.length < 7) next.password = 'Password must be at least 7 characters'
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match'
    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validationErrors = validate()
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setIsSubmitting(true)
    await new Promise((r) => setTimeout(r, 600))
    setIsSubmitting(false)
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
                placeholder="Enter new password"
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
