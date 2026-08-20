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
    <AppShell showNav={false}>
      <PageHeader title="Notification Preferences" backTo="/settings" />
      <div className="px-4 py-6 pb-12 space-y-4 animate-fade-in">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Manage Notifications</h2>
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-2 divide-y divide-gray-50">
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
    </AppShell>
  )
}

export default NotificationPreferences
