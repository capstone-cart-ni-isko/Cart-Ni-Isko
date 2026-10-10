import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminAccount from './AdminAccount.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import { fetchSettings, updateSettings, fetchMyPreferences, updateMyPreferences } from '../../services/settings.js'

// ── Reusable inline toggle ──────────────────────────────────────────────────
function Toggle({ checked, onChange, size = 'md' }) {
  const sizes = {
    lg: { track: 'h-6 w-11', thumb: 'h-5 w-5', on: 'translate-x-5' },
    md: { track: 'h-5 w-9',  thumb: 'h-4 w-4', on: 'translate-x-4' },
  }
  const s = sizes[size] || sizes.md
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${s.track} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${
        checked ? 'bg-brand-orange' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block ${s.thumb} transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? s.on : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Small chevron icon ──────────────────────────────────────────────────────
function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ── Preview row ─────────────────────────────────────────────────────────────
function PreviewRow({ label, value, last = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between py-2.5 text-left transition-colors hover:bg-slate-50 rounded-lg px-2 -mx-2 ${
        !last ? 'border-b border-slate-100' : ''
      }`}
    >
      <span className="text-xs text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-800">{value}</span>
        <ChevronRight />
      </div>
    </button>
  )
}

/* ── Settings rail icon ───────────────────────────────────────────────────────
   Every rail entry carries BOTH an icon and a label, mirroring the docked
   admin sidebar and the customer settings menu. */
function railIcon(paths) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      {paths}
    </svg>
  )
}

/* ── Focused-page back / exit controls ──────────────────────────────────────
   Rule 69 ("back" top-left) and rule 70 ("exit" top-right). Settings is its
   own page, so it carries these two controls directly instead of borrowing the
   portal ribbon's. */
function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Back"
      aria-label="Back"
      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  )
}

function ExitButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
      title="Exit"
      aria-label="Exit"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span className="hidden sm:inline">Exit</span>
    </button>
  )
}

// ── Preview card ────────────────────────────────────────────────────────────
function PreviewCard({ title, icon, rows, onNavigate }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs hover:shadow-sm transition-shadow">
      <button
        type="button"
        onClick={onNavigate}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-orange-50 group-hover:text-brand-orange transition-colors">
            {icon}
          </span>
          <h3 className="text-xs font-bold text-slate-900 group-hover:text-brand-orange transition-colors">
            {title}
          </h3>
        </div>
        <ChevronRight />
      </button>
      <div className="space-y-0.5">
        {rows.map((row, i) => (
          <PreviewRow
            key={row.label}
            label={row.label}
            value={row.value}
            last={i === rows.length - 1}
            onClick={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * A labelled numeric field used by both the preference and system panes.
 *
 * Rules 66 & 67 — the number is checked on every keystroke and the verdict is
 * printed right under the control, instead of the old behaviour of silently
 * throwing the typed value away on blur. An out-of-range value stays on
 * screen so it can be corrected, and it is never committed.
 */
function NumberField({ label, hint, value, min, max, step = 1, suffix, onSave }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  useEffect(() => {
    setDraft(String(value ?? ''))
  }, [value])

  const text = String(draft).trim()
  const parsed = Number(draft)
  const error = !text
    ? 'Enter a number.'
    : Number.isNaN(parsed)
      ? 'Enter a number.'
      : parsed < min
        ? `Must be ${min} or more.`
        : parsed > max
          ? `Must be ${max} or less.`
          : ''

  const commit = () => {
    if (error) return
    onSave(parsed)
  }

  return (
    <div className="py-3 border-b border-slate-100 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">{label}</p>
          {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            aria-invalid={!!error}
            aria-describedby={error ? `${label.replace(/\s+/g, '-').toLowerCase()}-error` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className={`w-24 bg-white border rounded-lg px-2.5 py-1.5 text-xs text-slate-900 text-right focus:outline-none focus:ring-1 transition-colors ${
              error
                ? 'border-rose-300 text-rose-700 focus:border-rose-500 focus:ring-rose-400'
                : 'border-slate-200 focus:border-brand-orange focus:ring-brand-orange'
            }`}
          />
          {suffix && <span className="text-[11px] text-slate-400 font-medium">{suffix}</span>}
        </div>
      </div>
      {/* Rule 67 — the message sits below/beside the field it belongs to. */}
      {error && (
        <p
          id={`${label.replace(/\s+/g, '-').toLowerCase()}-error`}
          className="text-[11px] font-medium text-rose-600 mt-1.5"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * DOMAIN 15 - EMPLOYEE SETTINGS.
 *
 * FLOW-EMP_SET-01 — every employee reaches this screen from the ribbon's
 * "settings" icon, so it opens with the employee's own account (profile,
 * password, backup contacts - DOMAIN 4 / FLOW-EMP_SET-02/03) and preferences
 * (FLOW-EMP_SET-04 notification reminders, FLOW-EMP_SET-05 dark mode).
 *
 * FLOW-EMP_SET-06/07 — the store-wide half (appointment duration, timeslot
 * capacity, minimum weekly hours, notification intervals) is shown only to a
 * super admin; SettingsAPI refuses those keys for anybody else (rule 40).
 */
export default function AdminSettings() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { isSuperAdmin, logoutAdmin } = useAdmin()
  const { dark, set: setTheme } = useTheme()

  const [activeSection, setActiveSection] = useState('account')

  // Real settings (GET /settings/display)
  const [settings, setSettings] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  // Personal preferences (the caller's own `emp_*` columns)
  const [prefs, setPrefs] = useState({})

  // Store Operations
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [acceptOnlineOrders, setAcceptOnlineOrders] = useState(true)
  const [allowInStorePickup, setAllowInStorePickup] = useState(true)
  const [allowDelivery, setAllowDelivery] = useState(true)

  // FLOW-EMP_SET-07 - store-wide timing and notification parameters
  const [slotMinutes, setSlotMinutes] = useState(10)
  const [visitCapacity, setVisitCapacity] = useState(1)
  const [pickupCapacity, setPickupCapacity] = useState(5)
  const [weeklyHours, setWeeklyHours] = useState(3)
  const [reminderMinutes, setReminderMinutes] = useState(10)
  const [followupHours, setFollowupHours] = useState(2)

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setLoadError('')
    fetchSettings()
      .then((s) => {
        if (cancelled) return
        const data = s || {}
        setSettings(data)
        setIsStoreOpen(data.store_open ?? !(data.maintenance_mode ?? false))
        setAcceptOnlineOrders(data.accept_online_orders ?? true)
        setAllowInStorePickup(data.allow_in_store_pickup ?? true)
        setAllowDelivery(data.allow_delivery ?? true)
        setSlotMinutes(Number(data.slot_minutes ?? 10))
        setVisitCapacity(Number(data.visit_slot_capacity ?? 1))
        setPickupCapacity(Number(data.pickup_slot_capacity ?? 5))
        setWeeklyHours(Number(data.min_weekly_minutes ?? 180) / 60)
        setReminderMinutes(Number(data.appointment_reminder_minutes ?? 10))
        setFollowupHours(Number(data.notif_followup_hours ?? 2))
        setHasUnsavedChanges(false)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err?.message || 'Unable to load settings.')
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // The employee's own preference columns (FLOW-EMP_SET-04 / 05).
  useEffect(() => {
    let cancelled = false
    fetchMyPreferences()
      .then((data) => {
        if (!cancelled) setPrefs(data || {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const mark = () => setHasUnsavedChanges(true)

  const handleToggle = (setter, current, label) => (val) => {
    setter(val)
    mark()
    showToast(`${label} ${val ? 'enabled' : 'disabled'}.`, 'info')
  }

  const handleDiscard = () => {
    setIsStoreOpen(settings.store_open ?? !(settings.maintenance_mode ?? false))
    setAcceptOnlineOrders(settings.accept_online_orders ?? true)
    setAllowInStorePickup(settings.allow_in_store_pickup ?? true)
    setAllowDelivery(settings.allow_delivery ?? true)
    setSlotMinutes(Number(settings.slot_minutes ?? 10))
    setVisitCapacity(Number(settings.visit_slot_capacity ?? 1))
    setPickupCapacity(Number(settings.pickup_slot_capacity ?? 5))
    setWeeklyHours(Number(settings.min_weekly_minutes ?? 180) / 60)
    setReminderMinutes(Number(settings.appointment_reminder_minutes ?? 10))
    setFollowupHours(Number(settings.notif_followup_hours ?? 2))
    setHasUnsavedChanges(false)
    showToast('Changes discarded.', 'info')
  }

  // Persist only this page's keys (maintenance_mode mirrors store_open so the
  // open/closed state round-trips through GET /settings/display).
  const handleSave = async () => {
    const payload = {
      store_open: isStoreOpen,
      maintenance_mode: !isStoreOpen,
      accept_online_orders: acceptOnlineOrders,
      allow_in_store_pickup: allowInStorePickup,
      allow_delivery: allowDelivery,
      // FLOW-EMP_SET-07 - appointment duration, timeslot capacity, minimum
      // weekly hours and the notification intervals.
      slot_minutes: slotMinutes,
      visit_slot_duration: slotMinutes,
      pickup_slot_duration: slotMinutes,
      visit_slot_capacity: visitCapacity,
      pickup_slot_capacity: pickupCapacity,
      min_weekly_minutes: Math.round(weeklyHours * 60),
      appointment_reminder_minutes: reminderMinutes,
      notif_followup_hours: followupHours,
    }

    setIsSaving(true)
    try {
      await updateSettings(payload)
      setSettings((prev) => ({ ...prev, ...payload }))
      setHasUnsavedChanges(false)
      showToast('Settings saved successfully!', 'success')
    } catch (err) {
      showToast(err?.message || 'Failed to save settings.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  /* ── FLOW-EMP_SET-04 / FLOW-EMP_SET-08: preference changes are written to
        the employee's own row the moment they are made. ── */
  const savePrefs = async (patch) => {
    setPrefs((prev) => ({ ...prev, ...patch }))
    try {
      const data = await updateMyPreferences(patch)
      setPrefs(data || {})
    } catch (err) {
      showToast(err?.message || 'Could not save that preference.', 'error')
    }
  }

  const handleDarkMode = (next) => {
    setTheme(next)
    savePrefs({ darkmode: next })
  }

  const navSections = [
    {
      group: 'My Settings',
      items: [
        {
          id: 'account',
          label: 'Profile & Security',
          icon: railIcon(
            <>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </>
          ),
        },
        {
          id: 'preferences',
          label: 'Notifications & Theme',
          icon: railIcon(
            <>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </>
          ),
        },
      ],
    },
    ...(isSuperAdmin
      ? [
          {
            group: 'Store',
            items: [
              {
                id: 'store-operations',
                label: 'Store Operations',
                icon: railIcon(
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </>
                ),
              },
              {
                id: 'timing',
                label: 'Appointments & Scheduling',
                icon: railIcon(
                  <>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </>
                ),
              },
            ],
          },
        ]
      : []),
  ]

  const isSystemPane = activeSection === 'store-operations' || activeSection === 'timing'

  /* ── FLOW-EMP_SET-01 — Settings is its OWN page (system rule 65: the ribbon
        belongs to the page it sits on). Nothing from the home page - no ribbon,
        no docked menu sidebar, no home tabs - is rendered here: this focused
        shell supplies its own back / exit controls and its own settings rail. ── */
  const handleBack = () => navigate(-1)

  const handleExit = () => {
    logoutAdmin()
    navigate('/admin/login')
  }

  const sectionTitle =
    activeSection === 'preferences'
      ? 'Notifications & Theme'
      : activeSection === 'store-operations'
        ? 'Store Operations'
        : activeSection === 'timing'
          ? 'Appointments & Scheduling'
          : 'Profile & Security'

  const sectionBlurb =
    activeSection === 'preferences'
      ? 'Your notification reminders and your theme, stored with your account the moment you change them.'
      : activeSection === 'store-operations'
        ? 'Control when your store accepts orders and how customers can purchase items.'
        : activeSection === 'timing'
          ? 'Store-wide timing parameters from FLOW-EMP_SET-07. They apply to every user immediately.'
          : 'Your account, your password and your backup contacts.'

  return (
    <div className="admin-portal h-screen bg-[#F8F9FA] flex flex-col w-full font-sans antialiased text-gray-900 overflow-hidden">
      {/* ── Focused-page header: back (top-left, rule 69) · exit (top-right, rule 70) ── */}
      <header className="h-14 shrink-0 z-30 select-none bg-white border-b border-gray-100 w-full px-4 md:px-6 flex items-center gap-3">
        <BackButton onClick={handleBack} />
        <h1 className="text-base font-extrabold text-gray-900 tracking-tight truncate">Settings</h1>
        <div className="ml-auto flex items-center gap-2">
          <ExitButton onClick={handleExit} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0 w-full">
        {/* LEFT — the docked settings card, the same left-docked card language
            the menu sidebar uses */}
        <aside className="hidden md:block shrink-0 w-72 h-full min-h-0 p-3 z-20">
          <div className="w-full h-full bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 p-3 overflow-hidden">
            {navSections.map((section) => (
              <div key={section.group} className="mb-4 last:mb-0">
                <p className="px-2.5 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {section.group}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = activeSection === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold transition-all duration-150 cursor-pointer text-left ${
                          active
                            ? 'bg-brand-orange/10 text-brand-orange'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="pt-3 mt-3 border-t border-slate-100">
              <p className="px-2.5 text-[11px] font-semibold text-slate-400">
                Signed in as <span className="text-slate-600 font-bold">{prefs.emp_email || 'employee'}</span>
              </p>
            </div>
          </div>
        </aside>

        {/* RIGHT — the focused settings content */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-5">
          <div className="pb-28">
            {/* ── Section header ── */}
            <div className="mb-6 pb-5 border-b border-slate-200">
              <h2 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">{sectionTitle}</h2>
              <p className="text-sm text-slate-500 mt-1">{sectionBlurb}</p>
            </div>

            {/* Mobile settings rail — the same entries, stacked on a small screen */}
            <div className="md:hidden mb-5 bg-white rounded-xl border border-slate-200 p-3 space-y-3">
              {navSections.map((section) => (
                <div key={section.group}>
                  <p className="px-2.5 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {section.group}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = activeSection === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveSection(item.id)}
                          aria-current={active ? 'page' : undefined}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-semibold transition-all duration-150 cursor-pointer text-left ${
                            active
                              ? 'bg-brand-orange/10 text-brand-orange'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <span className="shrink-0">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Load states ── */}
            {isLoading && isSystemPane && (
              <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs font-semibold text-slate-600 flex items-center gap-2">
                <span className="spinner-circle !w-3.5 !h-3.5" /> Loading settings…
              </div>
            )}
            {loadError && (
              <div className="mb-4 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-red-700">{loadError}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="space-y-5">
            {/* ── FLOW-EMP_PROF-01 / FLOW-EMP_SET-02/03 — the employee's own
                  profile, password and backup contacts (DOMAIN 4 + DOMAIN 15). */}
            {activeSection === 'account' && <AdminAccount embedded />}
            {/* ── FLOW-EMP_PROF-01 / FLOW-EMP_SET-02/03 — the employee's own
                  profile, password and backup contacts (DOMAIN 4 + DOMAIN 15). */}
            {activeSection === 'account' && <AdminAccount embedded />}

            {/* ── FLOW-EMP_SET-04 / FLOW-EMP_SET-05 — personal preferences ── */}
            {activeSection === 'preferences' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4.5 h-4.5 text-brand-orange">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">Notifications &amp; theme</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Saved to your account the moment you change them (REQ-EMP_SET-04).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4">
                  <NumberField
                    label="Appointment reminder"
                    hint="How many minutes before an appointment you are reminded (0–1440)."
                    value={prefs.emp_notif_appointremind ?? prefs.notif_appointremind ?? 10}
                    min={0}
                    max={1440}
                    suffix="min before"
                    onSave={(value) => savePrefs({ notif_appointremind: value })}
                  />

                  <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">Email notifications</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Store announcements and system alerts sent to your Bicol University mailbox.
                      </p>
                    </div>
                    <Toggle
                      checked={Boolean(prefs.emp_notif_email ?? prefs.notif_email)}
                      onChange={(next) => savePrefs({ notif_email: next })}
                      size="md"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">Dark mode</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        FLOW-EMP_SET-05 — the choice is stored with your account and restored on your next
                        sign-in (REQ-EMP_SET-03).
                      </p>
                    </div>
                    <Toggle checked={dark} onChange={handleDarkMode} size="md" />
                  </div>
                </div>
              </div>
            )}

            {/* ── FLOW-EMP_SET-06 — store-wide operations (super admin) ── */}
            {isSuperAdmin && activeSection === 'store-operations' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4.5 h-4.5 text-emerald-600">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">Store Operations</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Control when your store accepts orders and how customers can purchase items.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6 space-y-4">
                  {/* Store Status — prominent row */}
                  <div className={`flex items-start justify-between gap-4 p-4 rounded-xl border ${
                    isStoreOpen ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isStoreOpen ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <span className="text-sm font-bold text-slate-900">
                          Store Status &mdash;{' '}
                          <span className={isStoreOpen ? 'text-emerald-700' : 'text-slate-500'}>
                            {isStoreOpen ? 'Store Open' : 'Store Closed'}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 ml-5">
                        When turned off, customers cannot place new orders.
                      </p>
                    </div>
                    <Toggle
                      checked={isStoreOpen}
                      onChange={handleToggle(setIsStoreOpen, isStoreOpen, 'Store Status')}
                      size="lg"
                    />
                  </div>

                  {/* Three secondary toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        label: 'Accept Online Orders',
                        desc: 'Bag checkout available',
                        checked: acceptOnlineOrders,
                        setter: setAcceptOnlineOrders,
                        name: 'Online Orders',
                      },
                      {
                        label: 'Allow In-Store Pickup',
                        desc: 'Campus claim stations active',
                        checked: allowInStorePickup,
                        setter: setAllowInStorePickup,
                        name: 'In-Store Pickup',
                      },
                      {
                        label: 'Allow Delivery',
                        desc: 'Courier dispatch enabled',
                        checked: allowDelivery,
                        setter: setAllowDelivery,
                        name: 'Delivery',
                      },
                    ].map((t) => (
                      <div
                        key={t.label}
                        className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 leading-snug">{t.label}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{t.desc}</p>
                        </div>
                        <Toggle
                          checked={t.checked}
                          onChange={handleToggle(t.setter, t.checked, t.name)}
                          size="md"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── FLOW-EMP_SET-07 — appointment duration, timeslot capacity,
                  minimum weekly hours, notification intervals (super admin) ── */}
            {isSuperAdmin && activeSection === 'timing' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4.5 h-4.5 text-blue-600">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">Appointments &amp; scheduling</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Store-wide parameters from FLOW-EMP_SET-07. They apply to every user immediately
                        (REQ-EMP_SET-05).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-2">
                  <NumberField
                    label="Appointment duration"
                    hint="Length of one appointment timeslot (business rule 11: exactly 10 minutes)."
                    value={slotMinutes}
                    min={1}
                    max={120}
                    suffix="min"
                    onSave={(value) => {
                      setSlotMinutes(value)
                      mark()
                    }}
                  />
                  <NumberField
                    label="Visit timeslot capacity"
                    hint="How many visit appointments one timeslot may hold (business rule 12)."
                    value={visitCapacity}
                    min={1}
                    max={20}
                    suffix="visits"
                    onSave={(value) => {
                      setVisitCapacity(value)
                      mark()
                    }}
                  />
                  <NumberField
                    label="Pickup timeslot capacity"
                    hint="How many pickup appointments one timeslot may hold (business rule 12)."
                    value={pickupCapacity}
                    min={1}
                    max={50}
                    suffix="pickups"
                    onSave={(value) => {
                      setPickupCapacity(value)
                      mark()
                    }}
                  />
                  <NumberField
                    label="Minimum weekly hours"
                    hint="Every employee must be prescheduled for at least this long per week (business rule 46)."
                    value={weeklyHours}
                    min={0}
                    max={80}
                    step={0.5}
                    suffix="hours"
                    onSave={(value) => {
                      setWeeklyHours(value)
                      mark()
                    }}
                  />
                  <NumberField
                    label="Appointment reminder interval"
                    hint="How many minutes before an appointment the reminder is sent."
                    value={reminderMinutes}
                    min={0}
                    max={1440}
                    suffix="min"
                    onSave={(value) => {
                      setReminderMinutes(value)
                      mark()
                    }}
                  />
                  <NumberField
                    label="System notification follow-up"
                    hint="How often pending system alerts are re-sent to staff."
                    value={followupHours}
                    min={1}
                    max={168}
                    suffix="hours"
                    onSave={(value) => {
                      setFollowupHours(value)
                      mark()
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── Preview Cards (super admin overview) ── */}
            {isSuperAdmin && (activeSection === 'store-operations' || activeSection === 'timing') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PreviewCard
                  title="Order Preferences"
                  onNavigate={() => setActiveSection('store-operations')}
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <path d="M16 10a4 4 0 0 1-8 0" />
                    </svg>
                  }
                  rows={[
                    { label: 'Max orders per time slot', value: `${settings.max_claiming_slots ?? 10} orders` },
                    { label: 'Order confirmation mode',  value: 'Automatic'  },
                    { label: 'Cancellation policy',      value: 'Within 24h' },
                  ]}
                />

                <PreviewCard
                  title="Notifications"
                  onNavigate={() => setActiveSection('timing')}
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  }
                  rows={[
                    { label: 'New order notifications', value: 'Instant Push' },
                    { label: 'Pickup reminders',        value: `${reminderMinutes}m Before` },
                    { label: 'Low-stock alerts',        value: `≤ ${settings.low_stock_threshold ?? 5} units` },
                  ]}
                />

                <PreviewCard
                  title="Access & Permissions"
                  onNavigate={() => setActiveSection('store-operations')}
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  }
                  rows={[
                    { label: 'Staff access',          value: 'POS & Claims'      },
                    { label: 'Manager permissions',   value: 'Catalog & Orders'  },
                    { label: 'Administrator',         value: 'Full Access'       },
                  ]}
                />
              </div>
            )}
          </div>
          </div>
        </main>
      </div>

      {/* ── Sticky Bottom Bar (system panes only) ── */}
      {isSuperAdmin && isSystemPane && (
        <div className="fixed bottom-0 right-0 left-0 md:left-72 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4 z-20 shadow-lg">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-slate-400' : hasUnsavedChanges ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-xs font-semibold text-slate-600">
              {isLoading ? 'Loading settings…' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={!hasUnsavedChanges || isLoading}
              onClick={handleDiscard}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isLoading || isSaving}
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
