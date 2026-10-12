import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useToast } from '../../hooks/useToast.js'
import { deleteOldAccessLogs, fetchAccessLogs } from '../../services/access.js'

/*
    DOMAIN 32 - FLOW-ACCESS_LOG-07 / REQ-ACCESS_LOG-02
    -------------------------------------------------
    `/admin/settings/logs` is the merged audit trail of every customer and
    employee, and it is reachable by a super admin only (rule 39): the route
    carries the same role guard the API does, so typing the URL is not a way
    around it.

    FLOW-ACCESS_LOG-08 - every row of custlog and emplog lands in ONE list,
    newest first. FLOW-ACCESS_LOG-09 - the list filters into "all",
    "customers" and "employees". REQ-ACCESS_LOG-03 - it is searchable by
    actor, by action type and by date range.

    REQ-ACCESS_LOG-01: the trail is immutable for everyone - no row of it can
    ever be edited, and no per-row delete exists anywhere. The ONE exception
    is the owner's retention policy: a super admin may delete EVERY entry
    older than 24 months in a single action (the button below), because the
    daily sweep would delete those entries at 60 months regardless. The
    system asks all super admins once every two weeks whether one of them
    wants to run that purge; entries younger than 24 months are never
    touched.
*/

const SCOPES = [
  { key: 'all', label: 'All' },
  { key: 'customers', label: 'Customers' },
  { key: 'employees', label: 'Employees' },
]

const ACTIONS = [
  { key: '', label: 'Any action' },
  { key: 'auth', label: 'Authentication' },
  { key: 'view', label: 'View' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
]

const ACCESS_STYLES = {
  auth: 'bg-amber-100 text-amber-700',
  view: 'bg-slate-100 text-slate-600',
  edit: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
}

/** "2026-10-10 14:03:11+00" -> a stamp the admin reads at a glance. */
function stamp(value) {
  if (!value) return '—'
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminAccessLogs({ embedded = false }) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [scope, setScope] = useState('all')
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // The search box settles before it is sent, so a name typed at keyboard
  // speed does not fire a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400)
    return () => clearTimeout(timer)
  }, [query])

  const params = useMemo(
    () => ({
      scope,
      q: debouncedQuery || undefined,
      access: action || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 200,
    }),
    [scope, debouncedQuery, action, from, to]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    fetchAccessLogs(params)
      .then((res) => {
        if (cancelled) return
        setRows(Array.isArray(res?.data) ? res.data : [])
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setError(err?.message || "We couldn't load the access log. Please try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [params])

  const clearFilters = () => {
    setScope('all')
    setQuery('')
    setAction('')
    setFrom('')
    setTo('')
  }

  const filtersOn = scope !== 'all' || query !== '' || action !== '' || from !== '' || to !== ''

  // DOMAIN 32 retention override: one action deletes every entry older than
  // 24 months and notifies all super admins of the count. Nothing younger is
  // touched, so the visible (newest-200) list usually does not change - it is
  // reloaded anyway so the screen always matches what is left.
  const [purging, setPurging] = useState(false)

  const purgeOldLogs = async () => {
    const confirmed = window.confirm(
      'Delete every access log entry older than 24 months?\n\n' +
        "This can't be undone, and every admin will be notified. " +
        'Entries younger than 24 months are never deleted. If no one acts, ' +
        'entries older than 24 months are removed on their own once they ' +
        'reach 60 months.'
    )
    if (!confirmed) return

    setPurging(true)
    try {
      const res = await deleteOldAccessLogs()
      showToast(res?.message || 'Old access log entries were deleted.', 'success')

      fetchAccessLogs(params)
        .then((r) => setRows(Array.isArray(r?.data) ? r.data : []))
        .catch(() => {})
    } catch (err) {
      showToast(err?.message || "We couldn't delete the old log entries. Please try again.", 'error')
    } finally {
      setPurging(false)
    }
  }

  const content = (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* "Back" (rule 69) belongs only on the standalone page; embedded in
          Settings, the shell already carries its own back and exit controls. */}
      <div className="flex items-start justify-between gap-3">
        {!embedded && (
          <div className="flex items-start gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/admin/settings')}
              title="Back"
              aria-label="Back"
              className="mt-1 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">Access Log</h1>
              <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
                A complete record of every sign-in, view and change made by customers and staff, newest first.
                Entries can never be edited or removed one by one — the only cleanup is the option below.
              </p>
            </div>
          </div>
        )}

        <div className={`flex items-center gap-2 shrink-0 ${embedded ? 'ml-auto' : ''}`}>
          {/* One-action cleanup for very old entries — admins only. */}
          <button
            type="button"
            onClick={purgeOldLogs}
            disabled={purging}
            title="Delete every access log entry older than 24 months"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors cursor-pointer disabled:cursor-wait"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
            {purging ? 'Deleting…' : 'Delete logs older than 24 months'}
          </button>

          <button
            type="button"
            onClick={() => fetchAccessLogs(params).catch((err) => showToast(err?.message || "We couldn't refresh the list. Please try again.", 'error'))}
            className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

        {/* FLOW-ACCESS_LOG-09 - all / customers / employees */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 border-b border-slate-200 scrollbar-none">
          {SCOPES.map(({ key, label }) => {
            const active = scope === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-orange-50 border border-brand-orange text-brand-orange'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* REQ-ACCESS_LOG-03 - search by actor or endpoint, by action type, by date range */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold text-slate-500 mb-1">Search</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or email…"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-bold text-slate-500 mb-1">Action</span>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:border-brand-orange"
              >
                {ACTIONS.map(({ key, label }) => (
                  <option key={key || 'any'} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] font-bold text-slate-500 mb-1">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-brand-orange"
              />
            </label>

            <label className="block">
              <span className="block text-[11px] font-bold text-slate-500 mb-1">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-brand-orange"
              />
            </label>
          </div>

          {filtersOn && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs font-bold text-brand-orange hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* The list itself */}
        {loading && rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 text-xs text-slate-400">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-brand-orange animate-spin" />
              Loading access log…
            </span>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-xl border border-slate-200 p-8">
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="16" y2="17" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700">No log entries match these filters.</p>
            <p className="text-xs text-slate-400 mt-1">Widen the date range or clear the filters to see more.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-bold">When</th>
                    <th className="px-4 py-3 font-bold">Account</th>
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">Action</th>
                    <th className="px-4 py-3 font-bold">Page</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const access = String(row.access || 'view').toLowerCase()
                    return (
                      <tr key={`${row.scope}-${row.log_id ?? row.id}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{stamp(row.created)}</td>
                        <td className="px-4 py-3">
                          <span className="block font-bold text-slate-800">{row.actor_name || 'Unknown account'}</span>
                          <span className="block text-[11px] text-slate-400">
                            #{row.actor_id} · {row.actor_role || row.scope}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-600 capitalize">{row.actor_type || row.scope}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase ${
                              ACCESS_STYLES[access] || ACCESS_STYLES.view
                            }`}
                          >
                            {access}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-medium">{row.endpoint || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400 font-medium">
          Showing {rows.length} of up to 200 entries · customers and staff together, newest first.
        </p>
      </div>
  )

  // Embedded in the Settings shell the shell supplies the layout; on its own
  // page this screen brings its own.
  return embedded ? content : <AdminLayout>{content}</AdminLayout>
}
