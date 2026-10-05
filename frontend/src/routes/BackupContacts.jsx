import { useEffect, useState } from 'react'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Button from '../components/ui/Button.jsx'
import OtpVerifyModal from '../components/ui/OtpVerifyModal.jsx'
import { useToast } from '../hooks/useToast.js'
import { fetchMyPreferences, updateMyPreferences } from '../services/settings.js'

/*
    DOMAIN 29 - FLOW-CUST_SET-04..06 / REQ-CUST_SET-02.

    The stored lists prefill the form (FLOW-CUST_SET-05) and every single
    change - add, modify, remove - clears a phone OTP before it is written
    (FLOW-CUST_SET-06). The two columns hold ';'-separated contact lists.
*/

const split = (value) =>
  String(value || '')
    .split(/[;,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)

const PHONE_RE = /^\+?[0-9][0-9\s-]{6,19}$/

function ContactList({ title, items, inputType, placeholder, onAdd, onRemove, busyIndex }) {
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const value = draft.trim()
    if (!value) return
    const valid = inputType === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : PHONE_RE.test(value)
    if (!valid) {
      setLocalError(inputType === 'email' ? 'Enter a valid email address.' : 'Enter a valid phone number.')
      return
    }
    if (items.includes(value)) {
      setLocalError('That contact is already on the list.')
      return
    }
    setLocalError('')
    onAdd(value).then((ok) => {
      if (ok) setDraft('')
    })
  }

  return (
    <div className="px-5 py-5">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>

      <ul className="mt-3 space-y-2">
        {items.length === 0 && (
          <li className="text-xs text-gray-400 font-medium">No contacts saved yet.</li>
        )}
        {items.map((item, index) => (
          <li
            key={item}
            className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5"
          >
            <span className="text-sm font-semibold text-gray-800 truncate">{item}</span>
            <button
              type="button"
              onClick={() => onRemove(item, index)}
              disabled={busyIndex === index}
              className="text-xs font-bold text-red-500 hover:text-red-600 disabled:opacity-60 shrink-0"
            >
              {busyIndex === index ? 'Verifying…' : 'Remove'}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="mt-4 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <input
            type={inputType === 'email' ? 'email' : 'tel'}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setLocalError('')
            }}
            placeholder={placeholder}
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all placeholder-gray-400"
          />
          {localError && <p className="mt-1.5 text-xs text-red-500 font-semibold">{localError}</p>}
        </div>
        <Button type="submit" className="h-11 px-5 rounded-xl font-bold shrink-0">
          Add
        </Button>
      </form>
    </div>
  )
}

function BackupContacts() {
  const { showToast } = useToast()
  const [phones, setPhones] = useState([])
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [otpOpen, setOtpOpen] = useState(false)
  const [pending, setPending] = useState(null) // { kind, value, apply }
  const [busyIndex, setBusyIndex] = useState(null)

  useEffect(() => {
    let alive = true
    fetchMyPreferences()
      .then((data) => {
        if (!alive) return
        setPhones(split(data.cust_backup_phone ?? data.backup_phone))
        setEmails(split(data.cust_backup_email ?? data.backup_email))
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setLoadError(err.message || 'Unable to load your backup contacts.')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Queues a change and asks for the OTP that REQ-CUST_SET-02 requires.
  const requestChange = (kind, value, apply, index = null) => {
    setBusyIndex(index)
    setPending({ kind, value, apply })
    setOtpOpen(true)
  }

  const saveList = async (nextPhones, nextEmailes) => {
    await updateMyPreferences({
      cust_backup_phone: nextPhones,
      cust_backup_email: nextEmailes,
    })
  }

  const handleVerified = async () => {
    if (!pending) return
    try {
      pending.apply()
      await saveList(
        pending.kind === 'phone' ? pending.value.next : phones,
        pending.kind === 'email' ? pending.value.next : emails
      )
      showToast('Backup contacts updated')
    } catch (err) {
      showToast(err.message || 'Unable to save your backup contacts.', 'error')
    } finally {
      setPending(null)
      setBusyIndex(null)
      setOtpOpen(false)
    }
  }

  const add = (kind) => async (value) =>
    new Promise((resolve) => {
      const current = kind === 'phone' ? phones : emails
      const next = [...current, value]
      requestChange(kind, { next }, () =>
        kind === 'phone' ? setPhones(next) : setEmails(next)
      )
      resolve(true)
    })

  const remove = (kind) => (value, index) => {
    const current = kind === 'phone' ? phones : emails
    const next = current.filter((entry) => entry !== value)
    requestChange(kind, { next }, () => (kind === 'phone' ? setPhones(next) : setEmails(next)), index)
  }

  return (
    <AccountLayout>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in w-full">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">Backup Contacts</h1>
          <p className="text-sm text-gray-400 mt-1">
            Alternate numbers and emails we can reach if your primary contact fails.
          </p>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Backup Contacts" backTo="/settings" />
        </div>

        <div className="space-y-5">
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            Adding, changing or removing a contact asks for a one-time code sent to your phone -
            each change is verified on its own.
          </p>

          {loadError ? (
            <p className="text-sm text-red-500 font-semibold">{loadError}</p>
          ) : loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-50">
              <ContactList
                title="Backup phone numbers"
                items={phones}
                inputType="tel"
                placeholder="Add a phone number"
                onAdd={add('phone')}
                onRemove={remove('phone')}
                busyIndex={busyIndex}
              />
              <ContactList
                title="Backup email addresses"
                items={emails}
                inputType="email"
                placeholder="Add an email address"
                onAdd={add('email')}
                onRemove={remove('email')}
                busyIndex={busyIndex}
              />
            </div>
          )}
        </div>
      </div>

      <OtpVerifyModal
        isOpen={otpOpen}
        purpose="backup_contacts"
        title="Verify this change"
        onClose={() => {
          setOtpOpen(false)
          setPending(null)
          setBusyIndex(null)
        }}
        onVerified={handleVerified}
      />
    </AccountLayout>
  )
}

export default BackupContacts
