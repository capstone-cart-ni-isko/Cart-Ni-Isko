import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Toggle from '../components/ui/Toggle.jsx'

function Security() {
  const [twoFactor, setTwoFactor] = useState(false)
  const [biometric, setBiometric] = useState(true)

  return (
    <AppShell>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-3xl mx-auto">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">Security</h1>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Security" backTo="/profile" />
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Security Settings</h2>
            <section className="bg-white border border-gray-200 rounded-2xl px-5 py-2 divide-y divide-gray-50 shadow-sm">
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
            <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Login Options</h2>
            <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-50 shadow-sm">
              <Link
                to="/settings/change-password"
                className="flex items-center justify-between px-5 py-4 text-sm font-bold text-gray-900 hover:bg-gray-50 active:bg-gray-100 transition-all"
              >
                <span>Change Password</span>
                <span className="text-gray-400 text-lg">›</span>
              </Link>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default Security

