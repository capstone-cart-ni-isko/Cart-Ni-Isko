import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import { useAuth } from '../hooks/useAuth.js'
import { updateCredentials } from '../services/auth.js'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Button from '../components/ui/Button.jsx'

function PasswordField({ label, name, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full h-12 px-4 pr-12 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-455 hover:text-brand-orange transition-colors"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

function ChangePassword() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { logout } = useAuth()

  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const newValid = form.newPass.length >= 8
  const matchValid = form.newPass === form.confirm && form.confirm.length > 0
  const canSubmit = form.current.length > 0 && newValid && matchValid

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || saving) return
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
    <AccountLayout>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in w-full">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">Change Password</h1>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Change Password" backTo="/settings" />
        </div>

        <div className="space-y-5">
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            Set a new strong password for your Tindahan ni Isko student account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <PasswordField
              label="Current Password"
              name="current"
              value={form.current}
              onChange={handleChange}
              placeholder="Enter current password"
            />
            <PasswordField
              label="New Password"
              name="newPass"
              value={form.newPass}
              onChange={handleChange}
              placeholder="At least 8 characters"
            />
            {form.newPass.length > 0 && !newValid && (
              <p className="text-red-500 text-xs font-semibold -mt-3">Password must be at least 8 characters.</p>
            )}
            <PasswordField
              label="Confirm New Password"
              name="confirm"
              value={form.confirm}
              onChange={handleChange}
              placeholder="Re-enter new password"
            />
            {form.confirm.length > 0 && !matchValid && (
              <p className="text-red-500 text-xs font-semibold -mt-3">Passwords do not match.</p>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                disabled={!canSubmit || saving}
                className="w-full h-12 rounded-full font-bold shadow-md"
              >
                {saving ? 'Updating…' : 'Update Password'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AccountLayout>
  )
}

export default ChangePassword
