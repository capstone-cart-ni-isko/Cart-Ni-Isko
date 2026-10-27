import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Segmented from '../../components/admin/kit/Segmented.jsx'
import BroadcastNotificationDrawer from '../../components/admin/BroadcastNotificationDrawer.jsx'
import Modal from '../../components/ui/Modal.jsx'
import NotificationCard, { inferNotificationDetails } from '../../components/ui/NotificationCard.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import { fetchAccounts } from '../../services/accounts.js'
import { useApiChange } from '../../hooks/useApiChange.js'
import {
  fetchNotifications,
  markRead,
  readNotificationsCache,
} from '../../services/notifications.js'

/** DOMAIN 31 - a relative stamp the same way the customer inbox shows it. */
function timeAgo(date) {
  if (Number.isNaN(date.getTime())) return 'Recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

/** GET /accounts/display row -> the recipient shape the broadcast drawer lists. */
function mapAccount(row) {
  if (!row) return null
  if (row.emp_id != null) {
    return {
      userId: row.emp_id,
      accountType: 'employee',
      name: `${row.emp_givname || ''} ${row.emp_surname || ''}`.trim() || row.emp_email || `Employee #${row.emp_id}`,
      email: row.emp_email || '',
    }
  }
  if (row.cust_id != null) {
    return {
      userId: row.cust_id,
      accountType: 'customer',
      name: `${row.cust_givname || ''} ${row.cust_surname || ''}`.trim() || row.cust_email || `Customer #${row.cust_id}`,
      email: row.cust_email || '',
    }
  }
  return null
}

/** Extract concerned order or appointment target for admin notification. */
function extractAdminTarget(message, row) {
  if (row?.notif_link) return row.notif_link
  const text = String(message || '')
  if (/order/i.test(text)) {
    const match = text.match(/(?:order|ord)[^\d]*#?(\d+)/i)
    const orderId = match ? match[1] : (row?.order_id || row?.ord_id || null)
    if (orderId) {
      return `/admin/orders?orderId=${encodeURIComponent(orderId)}&search=${encodeURIComponent(orderId)}&from=notifications`
    }
    return '/admin/orders?from=notifications'
  }
  if (/appointment/i.test(text)) {
    return '/admin/appointments?from=notifications'
  }
  if (/inventory|stock/i.test(text)) {
    return '/admin/inventory?from=notifications'
  }
  return null
}

/** empnotif_* row -> the card shape this page renders. */
function mapNotification(row, index) {
  const message = String(row.empnotif_msg ?? row.message ?? '')
  const created = row.empnotif_created ?? row.created_at
  const explicitPriority = String(row.empnotif_type || '').toLowerCase() === 'priority'

  const details = inferNotificationDetails(message, explicitPriority)

  return {
    id: row.empnotif_id ?? row.id ?? `notif-${index}`,
    message: details.cleanMessage,
    priority: details.priority,
    orderNumber: details.orderNumber,
    category: details.category,
    title: details.title,
    icon: details.icon,
    iconBg: details.iconBg,
    tag: details.tag,
    tagClass: details.tagClass,
    time: created ? timeAgo(new Date(created)) : 'Just now',
    // FLOW-NOTIF-05 - unread rows carry no *_read stamp.
    read: Boolean(row.empnotif_read ?? row.read),
    targetUrl: extractAdminTarget(message, row),
  }
}

/**
 * FLOW-EMP_HOME-08 - the "notification" icon in the ribbon opens this tab.
 *
 * FLOW-NOTIF-02..06: the backend already answers unread-first, priority-first,
 * newest-first; opening a row stamps its read time and the unread counter on
 * the ribbon follows through the `notifications-changed` event.
 */
export default function AdminNotifications() {
  const navigate = useNavigate()
  const { currentAdminUser } = useAdmin()
  const { showToast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedNotif, setSelectedNotif] = useState(null)

  const empId = currentAdminUser?.id ?? null

  const load = useCallback(async () => {
    if (!empId) {
      setItems([])
      setLoading(false)
      return
    }

    // 60-second mirror paints instantly, then the request refreshes it.
    const cached = readNotificationsCache('employee', empId)
    if (cached) {
      setItems((prev) => (prev.length ? prev : cached.map(mapNotification)))
      setLoading(false)
    }

    try {
      const rows = await fetchNotifications('employee', empId)
      setItems((rows || []).map(mapNotification))
    } catch (err) {
      console.warn('Failed to load notifications:', err?.message)
    } finally {
      setLoading(false)
    }
  }, [empId])

  // Realtime (FLOW-NOTIF-01): a notification generated by a checkout, an order
  // status change or a booking lands in the open inbox at once.
  const version = useApiChange('notif')

  useEffect(() => {
    load()
  }, [load, version])

  /**
   * FLOW-NOTIF-05: clicking a notification marks it read only then.
   * If targetUrl exists, redirects to the concerned page; otherwise displays
   * a focused closable modal with full concise details.
   */
  const openNotification = (item) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
      markRead(item.id, 'employee')
        .catch(() => {})
        .finally(() => window.dispatchEvent(new Event('notifications-changed')))
    }

    if (item.targetUrl) {
      navigate(item.targetUrl)
    } else {
      setSelectedNotif(item)
    }
  }

  // Staff broadcast (POST /notif/distribute) to customers or employees
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [accounts, setAccounts] = useState([])

  const openBroadcast = () => {
    setBroadcastOpen(true)
    fetchAccounts()
      .then((payload) => {
        const rows = Array.isArray(payload)
          ? payload
          : [...(payload?.customers || []), ...(payload?.employees || [])]
        setAccounts(rows.map(mapAccount).filter(Boolean))
      })
      .catch(() => setAccounts([]))
  }

  const handleBroadcastSent = (count, recipientType) => {
    showToast(`Notification sent to ${count} ${recipientType === 'employee' ? 'employee' : 'customer'}${count === 1 ? '' : 's'}.`, 'success')
  }

  const unread = items.filter((n) => !n.read)
  const shown = filter === 'unread' ? unread : items

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header — same type treatment as the customer inbox */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="page-title text-slate-900 dark:text-[var(--ink)]">
              Notifications
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
              Store updates, appointment activity and system notices for your account.
            </p>
          </div>
          <button
            type="button"
            onClick={openBroadcast}
            className="btn btn--primary shrink-0"
          >
            Send notification
          </button>
        </div>

        {/* Filter pills - the kit segmented control (item 27: one control, not
            a page-owned pill row) */}
        <div className="border-b border-slate-200 dark:border-[var(--line)] pb-2">
          <Segmented
            label="Notification filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: items.length },
              { value: 'unread', label: 'Unread', count: unread.length },
            ]}
          />
        </div>

        {/* Inbox */}
        {loading && items.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 text-xs text-slate-400">
              <span className="spinner-circle !w-3.5 !h-3.5" />
              Loading notifications…
            </span>
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-xl border border-slate-200 p-8">
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700">
              {filter === 'unread' ? 'You are all caught up.' : 'No notifications yet.'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Store activity and system notices will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((item) => (
              <NotificationCard
                key={item.id}
                notification={item}
                onClick={openNotification}
                actionLabel="View details"
              />
            ))}

            <div className="text-xs text-slate-400 font-medium pt-1 text-center sm:text-left">
              Showing {shown.length} of {items.length} notification{items.length === 1 ? '' : 's'}
            </div>
          </div>
        )}
      </div>

      <BroadcastNotificationDrawer
        isOpen={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        accounts={accounts}
        onSent={handleBroadcastSent}
      />

      {/* Focused Notification Detail Popup */}
      <Modal
        isOpen={Boolean(selectedNotif)}
        onClose={() => setSelectedNotif(null)}
        title={selectedNotif?.title || 'Notification Details'}
        subtitle={selectedNotif?.time || ''}
        size="sm"
        footer={
          <div className="flex items-center justify-end w-full">
            <button
              type="button"
              onClick={() => setSelectedNotif(null)}
              className="px-4 py-2 rounded-xl bg-brand-orange text-white text-xs font-semibold hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedNotif && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedNotif.priority && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  Priority
                </span>
              )}
              {selectedNotif.orderNumber && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-mono font-semibold bg-orange-50 text-brand-orange border border-orange-200/60">
                  {selectedNotif.orderNumber}
                </span>
              )}
              {selectedNotif.tag && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border ${selectedNotif.tagClass}`}>
                  {selectedNotif.tag}
                </span>
              )}
              <span className="text-xs text-gray-400 font-medium ml-auto">{selectedNotif.time}</span>
            </div>
            <p className="text-sm text-gray-800 dark:text-[var(--ink)] leading-relaxed whitespace-pre-line">
              {selectedNotif.message}
            </p>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
