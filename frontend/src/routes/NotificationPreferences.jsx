import { useEffect, useState } from 'react'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { useToast } from '../hooks/useToast.js'
import { fetchMyPreferences, updateMyPreferences } from '../services/settings.js'

/*
    DOMAIN 29 - FLOW-CUST_SET-07..09 / REQ-CUST_SET-01, REQ-CUST_SET-03.

    The reminder is a number of MINUTES before the appointment and every edit
    saves on its own - no confirmation step, no Save button. The two delivery
    switches (REQ email + product updates) behave the same way.
*/

const REMINDER_PRESETS = [0, 15, 30, 60, 120, 1440]

function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-12 h-7 rounded-full p-1 transition-colors disabled:opacity-60 ${
          checked ? 'bg-brand-orange' : 'bg-gray-300'
        }`}
      >
        <span
          className={`block w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function NotificationPreferences() {
  const { showToast } = useToast()
  const [prefs, setPrefs] = useState(null)
  const [minutes, setMinutes] = useState('')
  const [loadError, setLoadError] = useState('')
  const [savingField, setSavingField] = useState('')

  useEffect(() => {
    let alive = true
    fetchMyPreferences()
      .then((data) => {
        if (!alive) return
        const stored = data.cust_notif_appointremind ?? data.notif_appointremind
        setPrefs({
          remind: stored === undefined || stored === null ? 60 : Number(stored),
          email: Boolean(
            data.cust_notif_email ?? data.notif_email ?? true
          ),
          prod: Boolean(data.cust_notif_prod ?? data.notif_prod ?? true),
        })
        setMinutes(String(stored ?? 60))
      })
      .catch((err) => alive && setLoadError(err.message || 'Unable to load your preferences.'))
    return () => {
      alive = false
    }
  }, [])

  // One field, one request, immediate feedback (FLOW-CUST_SET-08).
  const persist = async (patch, field, onOk) => {
    setSavingField(field)
    try {
      const next = await updateMyPreferences(patch)
      onOk?.(next)
      showToast('Preference saved')
    } catch (err) {
      showToast(err.message || 'Unable to save that preference.', 'error')
    } finally {
      setSavingField('')
    }
  }

  const saveReminder = async (rawMinutes) => {
    const value = Number(rawMinutes)
    if (Number.isNaN(value) || value < 0 || value > 1440) {
      showToast('Reminders must be between 0 and 1440 minutes (one day).', 'error')
      return
    }
    setMinutes(String(value))
    setPrefs((prev) => ({ ...prev, remind: value }))
    await persist({ cust_notif_appointremind: value }, 'remind')
  }

  if (loadError) {
    return (
      <AccountLayout>
        <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in w-full">
          <div className="hidden lg:block mb-8">
            <h1 className="text-3xl font-black text-gray-900">Notification Preferences</h1>
          </div>
          <div className="lg:hidden -mx-4 -mt-4 mb-4">
            <PageHeader title="Notification Preferences" backTo="/settings" />
          </div>
          <p className="text-sm text-red-500 font-semibold">{loadError}</p>
        </div>
      </AccountLayout>
    )
  }

  return (
    <AccountLayout>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in w-full">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">Notification Preferences</h1>
          <p className="text-sm text-gray-400 mt-1">Every change saves immediately.</p>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Notification Preferences" backTo="/settings" />
        </div>

        {!prefs ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Appointment reminder - REQ-CUST_SET-01 (minutes) */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-gray-50">
                <h2 className="text-sm font-bold text-gray-900">Appointment reminder</h2>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  How many minutes before an appointment we should remind you. Type a value between
                  0 and 1440 (one day), or pick one below.
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    onBlur={(e) => saveReminder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveReminder(e.currentTarget.value)
                    }}
                    aria-label="Reminder minutes before the appointment"
                    className="w-28 h-11 px-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
                  />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    minutes before
                  </span>
                  {savingField === 'remind' && (
                    <span className="ml-auto text-xs font-semibold text-brand-orange">Saving…</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {REMINDER_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => saveReminder(preset)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                        Number(minutes) === preset
                          ? 'bg-brand-orange border-brand-orange text-white'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-brand-orange hover:text-brand-orange'
                      }`}
                    >
                      {preset === 0 ? 'Off' : preset === 1440 ? '1 day' : `${preset} min`}
                    </button>
                  ))}
                </div>
              </div>

              <Toggle
                label="Email notifications"
                description="Also send order, appointment and account updates to your email."
                checked={prefs.email}
                disabled={savingField === 'email'}
                onChange={(next) => {
                  setPrefs((prev) => ({ ...prev, email: next }))
                  persist({ cust_notif_email: next }, 'email')
                }}
              />
              <div className="border-t border-gray-50" />
              <Toggle
                label="Product notifications"
                description="Hear about new arrivals, restocks and promos in your inbox."
                checked={prefs.prod}
                disabled={savingField === 'prod'}
                onChange={(next) => {
                  setPrefs((prev) => ({ ...prev, prod: next }))
                  persist({ cust_notif_prod: next }, 'prod')
                }}
              />
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-5">
              <h2 className="text-sm font-bold text-gray-900">Priority alerts</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                Changes to your orders and appointments, and any follow-up on a notification you
                have not read yet, are always delivered - they cannot be switched off.
              </p>
              <a
                href="/notifications"
                className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-brand-orange"
              >
                Go to your notifications <span className="text-lg leading-none">›</span>
              </a>
            </section>
          </div>
        )}
      </div>
    </AccountLayout>
  )
}

export default NotificationPreferences
