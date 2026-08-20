import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
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

  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const newValid = form.newPass.length >= 8
  const matchValid = form.newPass === form.confirm && form.confirm.length > 0
  const canSubmit = form.current.length > 0 && newValid && matchValid

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    showToast('Password updated successfully!')
    navigate('/settings')
  }

  return (
    <AppShell showNav={false}>
      <PageHeader title="Change Password" backTo="/settings" />

      <div className="px-5 py-6 pb-12 space-y-5 animate-fade-in">
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
              disabled={!canSubmit}
              className="w-full h-12 rounded-full font-bold shadow-md"
            >
              Update Password
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}

export default ChangePassword
