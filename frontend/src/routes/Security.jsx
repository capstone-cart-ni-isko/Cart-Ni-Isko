import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Toggle from '../components/ui/Toggle.jsx'

function Security() {
  const [twoFactor, setTwoFactor] = useState(false)
  const [biometric, setBiometric] = useState(true)

  return (
    <AppShell showNav={false}>
      <PageHeader title="Security" backTo="/profile" />
      <div className="px-6 py-6 pb-12 space-y-6 animate-fade-in">
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Security Settings</h2>
          <section className="bg-surface-gray rounded-2xl px-5 py-2 divide-y divide-gray-100">
            <Toggle
              label="Two-Factor Authentication"
              description="Add an extra layer of security to your account"
              checked={twoFactor}
              onChange={setTwoFactor}
            />
            <Toggle
              label="Biometric Login"
              description="Use fingerprint or face ID to sign in"
              checked={biometric}
              onChange={setBiometric}
            />
          </section>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Login Options</h2>
          <section className="bg-surface-gray rounded-2xl overflow-hidden divide-y divide-gray-100">
            <Link
              to="/reset-password"
              className="flex items-center justify-between px-5 py-4 text-sm font-semibold text-gray-800 hover:bg-gray-100 active:bg-gray-200 transition-all"
            >
              <span>Change Password</span>
              <span className="text-gray-400 text-lg">›</span>
            </Link>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

export default Security

