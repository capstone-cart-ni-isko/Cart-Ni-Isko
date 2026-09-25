import { useMemo, useState } from 'react'
import DrawerPanel from './DrawerPanel.jsx'
import { distributeNotifications } from '../../services/notifications.js'

const MAX_MESSAGE = 255

/**
 * Staff broadcast (POST /notif/distribute): send one message to every active
 * customer or employee, or only to the accounts picked from the list.
 * `accounts` are the mapped AdminUsers rows ({ userId, accountType, name, email }).
 */
export default function BroadcastNotificationDrawer({ isOpen, onClose, accounts = [], onSent }) {
  const [recipientType, setRecipientType] = useState('customer')
  const [mode, setMode] = useState('all') // 'all' | 'selected'
  const [selectedIds, setSelectedIds] = useState([])
  const [filter, setFilter] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return accounts
      .filter((a) => a.accountType === recipientType && a.userId != null)
      .filter((a) => !q || `${a.name} ${a.email}`.toLowerCase().includes(q))
  }, [accounts, recipientType, filter])

  const reset = () => {
    setMode('all')
    setSelectedIds([])
    setFilter('')
    setMessage('')
    setError('')
  }

  const handleClose = () => {
    if (sending) return
    reset()
    onClose()
  }

  const switchType = (type) => {
    setRecipientType(type)
    setSelectedIds([])
  }

  const toggle = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const text = message.trim()
  const canSend = text.length > 0 && !sending && (mode === 'all' || selectedIds.length > 0)

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    setError('')
    try {
      const res = await distributeNotifications(
        recipientType,
        text,
        mode === 'selected' ? selectedIds : []
      )
      onSent?.(Number(res?.data?.sent_count ?? 0), recipientType)
      reset()
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to send the notification.')
    } finally {
      setSending(false)
    }
  }

  const pill = (active) =>
    `flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
      active
        ? 'bg-brand-orange text-white border-brand-orange'
        : 'bg-white text-slate-600 border-slate-200 hover:border-brand-orange'
    }`

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Send notification"
      subtitle="Delivered to each recipient's in-app inbox"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={sending}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="px-4 py-1.5 text-xs font-bold text-white bg-brand-orange hover:bg-brand-orange-dark rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recipients</p>
        <div className="flex gap-2">
          <button type="button" className={pill(recipientType === 'customer')} onClick={() => switchType('customer')}>
            Customers
          </button>
          <button type="button" className={pill(recipientType === 'employee')} onClick={() => switchType('employee')}>
            Employees
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" className={pill(mode === 'all')} onClick={() => setMode('all')}>
            All active {recipientType === 'customer' ? 'customers' : 'employees'}
          </button>
          <button type="button" className={pill(mode === 'selected')} onClick={() => setMode('selected')}>
            Selected only
          </button>
        </div>
      </div>

      {mode === 'selected' && (
        <div className="space-y-1.5">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or email"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
            {candidates.length === 0 ? (
              <p className="text-xs text-slate-400 p-3 text-center">No matching accounts.</p>
            ) : (
              candidates.map((a) => (
                <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(a.userId)}
                    onChange={() => toggle(a.userId)}
                    className="accent-[var(--color-brand-orange,#f97316)]"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900 truncate">{a.name}</span>
                    {a.email && <span className="block text-slate-500 truncate">{a.email}</span>}
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="text-[11px] text-slate-500">{selectedIds.length} selected</p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Message</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
          rows={4}
          placeholder="e.g. The store will close early at 3 PM on Friday."
          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
        />
        <p className="text-[11px] text-slate-400 text-right">
          {message.length}/{MAX_MESSAGE}
        </p>
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">{error}</p>
      )}
    </DrawerPanel>
  )
}
