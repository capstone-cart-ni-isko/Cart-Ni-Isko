import { useState } from 'react'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Toggle from '../components/ui/Toggle.jsx'

const notifItems = [
  { key: 'orderUpdates', label: 'Order Updates', description: 'Status changes on your orders' },
  { key: 'promotions', label: 'Promotions', description: 'Deals, sales, and new arrivals' },
  { key: 'messages', label: 'Messages', description: 'Direct messages from the store' },
  { key: 'appointments', label: 'Appointments', description: 'Reminders for store visits and pick-ups' },
  { key: 'security', label: 'Security Alerts', description: 'Login attempts and account changes' },
]

function NotificationPreferences() {
  const [settings, setSettings] = useState({
    orderUpdates: true,
    promotions: false,
    messages: true,
    appointments: true,
    security: true,
  })

  const toggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <AppShell>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-3xl mx-auto">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">Notification Preferences</h1>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Notification Preferences" backTo="/settings" />
        </div>

        <div className="space-y-4">
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Manage Notifications</h2>
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-2 divide-y divide-gray-50">
            {notifItems.map(({ key, label, description }) => (
              <Toggle
                key={key}
                label={label}
                description={description}
                checked={settings[key]}
                onChange={() => toggle(key)}
              />
            ))}
          </section>
        </div>
      </div>
    </AppShell>
  )
}

export default NotificationPreferences
