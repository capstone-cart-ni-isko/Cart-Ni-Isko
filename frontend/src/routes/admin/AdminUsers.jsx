import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { fetchAccounts } from '../../services/accounts.js'
import { logAction } from '../../services/access.js'
import {
  first,
  empCateg,
  empFullName,
  empStatus,
  fmtDateTime,
} from '../../components/admin/schema.js'

const PAGE_SIZE = 50 // pagination kicks in past 50 employees

const CATEGORY_LABEL = {
  staff: 'Staff',
  admin: 'Admin',
  'super admin': 'Super Admin',
}

const STATUS_LABEL = {
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
}

const CATEGORIES = ['staff', 'admin', 'super admin']
const STATUSES = ['active', 'suspended', 'deleted']

/** Normalize one employee row from /accounts/display into a table row. */
function mapEmployee(row) {
  const categ = empCateg(row)
  return {
    emp_id: first(row, 'emp_id'),
    name: empFullName(row),
    email: String(first(row, 'emp_email') || ''),
    phone: String(first(row, 'emp_phone') || ''),
    category: categ,
    status: empStatus(row),
    created: first(row, 'emp_created'),
    suspended: !!first(row, 'emp_suspended', 'emp_disabled'),
    deleted: !!first(row, 'emp_deleted'),
    raw: row,
  }
}

export default function AdminUsers() {
  const { currentAdminUser, isSuperAdmin } = useAdmin()
  const { showToast } = useToast()

  const [employees, setEmployees] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Filters / search / sort / pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)

  const loadEmployees = useCallback(async () => {
    setIsLoading(true)
    setPageError('')
    try {
      const payload = await fetchAccounts({ account_type: 'employee' })
      const rows = Array.isArray(payload)
        ? payload.filter((r) => r.emp_id != null)
        : Array.isArray(payload?.employees)
          ? payload.employees
          : []
      setEmployees(rows.map(mapEmployee))
    } catch (err) {
      setPageError(err?.message || 'Unable to load the staff directory.')
      setEmployees([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees, reloadKey])

  // Header stats: total active count + distribution by category.
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'active'),
    [employees]
  )
  const categoryDistribution = useMemo(() => {
    const counts = { staff: 0, admin: 0, 'super admin': 0 }
    activeEmployees.forEach((e) => {
      if (Object.prototype.hasOwnProperty.call(counts, e.category)) counts[e.category] += 1
    })
    return counts
  }, [activeEmployees])

  // REQ-EMP_HOME/UM rules: deleted employees are visible ONLY under the
  // deleted filter; every other view hides them.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let rows = employees.filter((e) => {
      if (statusFilter === 'deleted') {
        if (!e.deleted) return false
      } else if (e.deleted) {
        return false
      }
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (statusFilter !== 'all' && statusFilter !== 'deleted' && e.status !== statusFilter) {
        return false
      }
      if (statusFilter === 'deleted' && e.status !== 'deleted') return false
      if (q) {
        const hay = `${e.name} ${e.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    const dir = sortOrder === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name) * dir
      if (sortBy === 'email') return a.email.localeCompare(b.email) * dir
      if (sortBy === 'created') {
        return ((new Date(a.created || 0)).getTime() - (new Date(b.created || 0)).getTime()) * dir
      }
      return 0
    })
    return rows
  }, [employees, searchQuery, categoryFilter, statusFilter, sortBy, sortOrder])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  )

  // Reset to page 1 whenever the filters change.
  useEffect(() => {
    setPage(1)
  }, [searchQuery, categoryFilter, statusFilter, sortBy, sortOrder])

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortOrder(key === 'created' ? 'desc' : 'asc')
    }
  }

  const sortIndicator = (key) =>
    sortBy === key ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''

  const recordLog = (action, description) => {
    logAction({
      user_id: currentAdminUser?.id ?? 0,
      user_type: 'employee',
      action,
      desc: `${description} (by ${currentAdminUser?.name || 'Staff'})`,
    }).catch(() => {})
  }

  const handleSuspend = async (emp) => {
    if (!isSuperAdmin) {
      showToast('Only the Super Admin may suspend accounts.', 'error')
      return
    }
    // PUT /accounts/disable with a reason (ban flow).
    const { apiPost } = await import('../../services/api.js')
    try {
      await apiPost('/accounts/disable', {
        account_type: 'employee',
        user_id: emp.emp_id,
        reason: 'Suspended from the staff directory',
      })
      recordLog('SUSPEND ACCOUNT', `Suspended ${emp.name}`)
      showToast(`${emp.name} has been suspended.`, 'success')
      setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(err?.message || 'Failed to suspend the account.', 'error')
    }
  }

  const handleRecover = async (emp) => {
    if (!isSuperAdmin) {
      showToast('Only the Super Admin may recover accounts.', 'error')
      return
    }
    const { apiPost } = await import('../../services/api.js')
    try {
      await apiPost('/accounts/recover', {
        account_type: 'employee',
        user_id: emp.emp_id,
      })
      recordLog('RECOVER ACCOUNT', `Recovered ${emp.name}`)
      showToast(`${emp.name} has been recovered.`, 'success')
      setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(err?.message || 'Failed to recover the account.', 'error')
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
              Staff Directory
            </h1>
            <p className="text-sm text-slate-500 font-normal mt-1">
              Manage employee accounts, categories and access.
            </p>
          </div>
          <Link
            to="/admin/enroll"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer w-fit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Enroll Staff</span>
          </Link>
        </div>

        {/* Summary header: total active + category distribution */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-4">
            <p className="text-[11px] font-medium text-slate-500">Total active</p>
            <p className="text-2xl font-bold text-slate-900 tracking-tight">{activeEmployees.length}</p>
          </div>
          {CATEGORIES.map((categ) => (
            <div key={categ} className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-4">
              <p className="text-[11px] font-medium text-slate-500">{CATEGORY_LABEL[categ]}s</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{categoryDistribution[categ]}</p>
            </div>
          ))}
        </div>

        {/* Search & filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/90 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange shadow-2xs transition-all"
            />
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 md:pb-0">
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none bg-white border border-slate-200/90 rounded-xl pl-4 pr-9 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-brand-orange shadow-2xs cursor-pointer"
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none bg-white border border-slate-200/90 rounded-xl pl-4 pr-9 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-brand-orange shadow-2xs cursor-pointer"
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            <div className="relative">
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [key, order] = e.target.value.split(':')
                  setSortBy(key)
                  setSortOrder(order)
                }}
                className="appearance-none bg-white border border-slate-200/90 rounded-xl pl-4 pr-9 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-brand-orange shadow-2xs cursor-pointer"
                aria-label="Sort by"
              >
                <option value="name:asc">Name (A–Z)</option>
                <option value="name:desc">Name (Z–A)</option>
                <option value="email:asc">Email (A–Z)</option>
                <option value="email:desc">Email (Z–A)</option>
                <option value="created:desc">Newest first</option>
                <option value="created:asc">Oldest first</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setCategoryFilter('all')
                setStatusFilter('all')
                setSortBy('name')
                setSortOrder('asc')
              }}
              title="Reset all filters"
              className="inline-flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>Reset</span>
            </button>
          </div>
        </div>

        {pageError && (
          <div className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium bg-rose-50 border-rose-200 text-rose-700">
            <span>{pageError}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="font-bold underline cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setPageError('')}
                title="Dismiss"
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-visible">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                  <th className="py-4 px-5 w-24">ID</th>
                  <th className="py-4 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="cursor-pointer uppercase tracking-wider hover:text-slate-600"
                    >
                      Name{sortIndicator('name')}
                    </button>
                  </th>
                  <th className="py-4 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('email')}
                      className="cursor-pointer uppercase tracking-wider hover:text-slate-600"
                    >
                      Email{sortIndicator('email')}
                    </button>
                  </th>
                  <th className="py-4 px-4">Phone</th>
                  <th className="py-4 px-4">Category</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('created')}
                      className="cursor-pointer uppercase tracking-wider hover:text-slate-600"
                    >
                      Created{sortIndicator('created')}
                    </button>
                  </th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-brand-orange animate-spin" />
                        Loading staff directory…
                      </span>
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      {employees.length === 0
                        ? 'No employees found. Enroll staff to populate the directory.'
                        : 'No employees match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((emp) => {
                    const initials = emp.name
                      .split(' ')
                      .filter(Boolean)
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                    return (
                      <tr key={emp.emp_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-5 font-mono text-slate-500">#{emp.emp_id}</td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#2563EB] font-bold text-xs flex items-center justify-center shrink-0">
                              {initials || '—'}
                            </div>
                            <span className="font-bold text-slate-900">{emp.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-600">{emp.email || '—'}</td>
                        <td className="py-4 px-4 text-slate-600">{emp.phone || '—'}</td>
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              emp.category === 'super admin'
                                ? 'bg-[#FFF7ED] text-[#EA580C] border border-orange-200/50'
                                : emp.category === 'admin'
                                  ? 'bg-[#FEF3C7] text-[#D97706] border border-amber-200/50'
                                  : 'bg-[#F1F5F9] text-[#475569] border border-slate-200/80'
                            }`}
                          >
                            {CATEGORY_LABEL[emp.category] || emp.category}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          {emp.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#ECFDF5] text-[#059669] border border-emerald-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                              Active
                            </span>
                          ) : emp.status === 'suspended' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Deleted
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-slate-500">{fmtDateTime(emp.created)}</td>
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          {!emp.deleted && (
                            <>
                              <Link
                                to={`/admin/account`}
                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 mr-3"
                              >
                                View
                              </Link>
                              {emp.status === 'active' ? (
                                <button
                                  type="button"
                                  onClick={() => handleSuspend(emp)}
                                  className="text-[11px] font-semibold text-amber-600 hover:text-amber-800 mr-3 cursor-pointer"
                                >
                                  Suspend
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRecover(emp)}
                                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 mr-3 cursor-pointer"
                                >
                                  Recover
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer: count + pagination (past 50 rows) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 font-medium">
              Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} employees
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 select-none">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200/80 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Previous page"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="px-2 text-xs font-semibold text-slate-600">
                  Page {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200/80 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Next page"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
