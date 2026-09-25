import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import BroadcastNotificationDrawer from '../../components/admin/BroadcastNotificationDrawer.jsx'
import {
  fetchAccounts,
  searchAccounts,
  banAccount,
  recoverAccount,
  deleteAccount,
  changeAccountType,
  updateAccount,
} from '../../services/accounts.js'
import { employeeSignUp } from '../../services/auth.js'
import { logAction } from '../../services/access.js'

// Available modules for granular permissions
const SYSTEM_MODULES = [
  { id: 'products', label: 'Products', desc: 'Manage products, categories, and inventory' },
  { id: 'orders', label: 'Orders', desc: 'View and manage orders' },
  { id: 'analytics', label: 'Analytics', desc: 'Access analytics and reports' },
  { id: 'content', label: 'Content', desc: 'Manage website content and pages' },
  { id: 'settings', label: 'Settings', desc: 'Manage system settings' },
]

// ── API → UI mapping helpers ────────────────────────────────────────────────
// The backend returns { customers, employees } (or a flat array from older
// builds); normalize both shapes into one row list.
function normalizeAccountList(payload) {
  const customers = Array.isArray(payload?.customers) ? payload.customers : null
  const employees = Array.isArray(payload?.employees) ? payload.employees : null
  if (customers || employees) {
    return [
      ...(employees || []).map((row) => ({ ...row, _group: 'employee' })),
      ...(customers || []).map((row) => ({ ...row, _group: 'customer' })),
    ]
  }
  if (Array.isArray(payload)) {
    return payload.map((row) => ({
      ...row,
      _group: row.emp_id != null ? 'employee' : 'customer',
    }))
  }
  return []
}

// Employees carry emp_type; resolve it into the role vocabulary this page renders.
function roleFromAccountType(group, rawType) {
  if (group === 'customer') return 'Customer'
  const t = String(rawType || '')
  if (/super[\s_]*admin|root/i.test(t)) return 'Super Admin'
  if (/admin|manager|officer/i.test(t)) return 'Admin'
  return 'Staff'
}

function permissionsForRole(role) {
  if (role === 'Super Admin') return 'Full System Access'
  if (role === 'Admin') return 'Products, Orders, Inventory, Schedule'
  if (role === 'Customer') return 'Customer Account'
  return 'Fulfillment, Orders, POS'
}

function mapAccountRow(row, idx) {
  const isEmp = row._group === 'employee'
  const id = isEmp ? row.emp_id : row.cust_id
  const name = isEmp
    ? `${row.emp_givname || ''} ${row.emp_surname || ''}`.trim() || row.emp_email || 'Unnamed account'
    : row.cust_nickname || row.cust_email || row.cust_phone || 'Unnamed account'
  const role = roleFromAccountType(row._group, row.emp_type || row.cust_type)
  const disabled = isEmp ? row.emp_disabled : row.cust_disabled
  const deleted = isEmp ? row.emp_deleted : row.cust_deleted
  return {
    id: `${isEmp ? 'emp' : 'cust'}-${id ?? idx}`,
    userId: id,
    accountType: isEmp ? 'employee' : 'customer',
    name,
    email: (isEmp ? row.emp_email : row.cust_email) || '',
    phone: (isEmp ? row.emp_phone : row.cust_phone) || '',
    role,
    permissions: permissionsForRole(role),
    modules: ['products', 'orders', 'analytics', 'content', 'settings'],
    photo: null,
    avatarBg: isEmp ? 'blue' : 'teal',
    status: deleted ? 'Deleted' : disabled ? 'Inactive' : 'Active',
  }
}

// Case-insensitive match across every field this page's search box claims.
function matchesQuery(user, q) {
  if (!q) return true
  const hay = `${user.name} ${user.email} ${user.phone} ${user.role} ${user.permissions}`.toLowerCase()
  return hay.includes(String(q).toLowerCase())
}

function errorMessage(err, fallback) {
  return err?.message || fallback || 'Request failed'
}

export default function AdminUsers() {
  const { currentAdminUser, isSuperAdmin } = useAdmin()
  const { showToast } = useToast()

  // Server-backed account list (User Management screen)
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState(null) // { type: 'success' | 'error', text }
  const [reloadKey, setReloadKey] = useState(0)

  // Table filters & search state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('All Roles')
  const [selectedStatus, setSelectedStatus] = useState('All Statuses')
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [activeMenuUserId, setActiveMenuUserId] = useState(null)
  const menuRef = useRef(null)

  // Broadcast drawer (POST /notif/distribute)
  const [showBroadcast, setShowBroadcast] = useState(false)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Ban / delete flows (REQ-UM-02 / REQ-UM-03)
  const [banTarget, setBanTarget] = useState(null)
  const [banReason, setBanReason] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteStep, setDeleteStep] = useState(1)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Modal Form State
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  // Employee record fields the backend validator requires (emp_signup).
  const [formStudnum, setFormStudnum] = useState('')
  const [formCollege, setFormCollege] = useState('')
  const [formProgram, setFormProgram] = useState('')
  const [formYear, setFormYear] = useState('')
  const [formBloc, setFormBloc] = useState('')
  const [tempPassword, setTempPassword] = useState('')
  const [formStatus, setFormStatus] = useState('Active')
  const [formRole, setFormRole] = useState('Super Admin')
  const [formModules, setFormModules] = useState(['products', 'orders', 'analytics', 'content', 'settings'])
  const [formAvatarPhoto, setFormAvatarPhoto] = useState(null)
  const fileInputRef = useRef(null)

  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuUserId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Server load (User Management: GET /accounts/display | /accounts/search) ──
  const loadAccounts = useCallback(async (q) => {
    setIsLoading(true)
    setPageError('')
    try {
      let payload = q ? await searchAccounts(q) : await fetchAccounts()
      let rows = normalizeAccountList(payload)
      // The server `q` search only covers name/email/phone — if it matches
      // nothing (e.g. searching a role like "Super Admin"), refetch the full
      // list and refine locally instead of showing a false empty state.
      if (q && rows.length === 0) {
        rows = normalizeAccountList(await fetchAccounts())
      }
      rows = rows.map(mapAccountRow)
      rows.sort((a, b) => {
        const ga = a.accountType === 'employee' ? 0 : 1
        const gb = b.accountType === 'employee' ? 0 : 1
        return ga - gb || a.name.localeCompare(b.name)
      })
      setUsers(rows)
    } catch (err) {
      setPageError(errorMessage(err, 'Unable to load accounts from the server.'))
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reloadAccounts = useCallback(() => setReloadKey((k) => k + 1), [])

  // Debounce the search box before it hits the API
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    loadAccounts(debouncedQuery)
  }, [debouncedQuery, reloadKey, loadAccounts])

  // REQ-UM-04: every management action is written to the access log.
  const recordLog = useCallback(
    (action, desc, target) => {
      logAction({
        user_id: target?.userId ?? currentAdminUser?.id ?? 0,
        user_type: target?.accountType || 'employee',
        action,
        desc: `${desc} (by ${currentAdminUser?.name || 'Staff'}${
          isSuperAdmin ? ', Super Admin' : ''
        })`,
      }).catch(() => {
        // Logging must never block the management action itself.
      })
    },
    [currentAdminUser?.id, currentAdminUser?.name, isSuperAdmin]
  )

  const notify = useCallback(
    (text, type = 'success') => {
      setNotice({ type, text })
      showToast(text, type)
    },
    [showToast]
  )

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim()
      const matchSearch = matchesQuery(u, q)

      const matchRole =
        selectedRole === 'All Roles' ||
        u.role?.toLowerCase() === selectedRole.toLowerCase()

      const matchStatus =
        selectedStatus === 'All Statuses' ||
        u.status?.toLowerCase() === selectedStatus.toLowerCase()

      return matchSearch && matchRole && matchStatus
    })
  }, [users, searchQuery, selectedRole, selectedStatus])

  // Select all handler
  const handleToggleSelectAll = () => {
    if (selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds([])
    } else {
      setSelectedUserIds(filteredUsers.map((u) => u.id))
    }
  }

  const handleToggleSelectRow = (id) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  // Open Modal for Add
  const handleOpenAdd = () => {
    if (!isSuperAdmin) {
      notify('Only the Super Admin may register staff accounts (REQ-UM-01).', 'error')
      return
    }
    setEditingUser(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormStudnum('')
    setFormCollege('')
    setFormProgram('')
    setFormYear('')
    setFormBloc('')
    setTempPassword('')
    setFormStatus('Active')
    setFormRole('Staff')
    setFormModules(['orders'])
    setFormAvatarPhoto(null)
    setShowModal(true)
  }

  // Open Modal for Edit
  const handleOpenEdit = (user) => {
    setEditingUser(user)
    setFormName(user.name || '')
    setFormEmail(user.email || '')
    setFormPhone(user.phone || '')
    setFormStudnum('')
    setFormCollege('')
    setFormProgram('')
    setFormYear('')
    setFormBloc('')
    setTempPassword('')
    setFormStatus(user.status || 'Active')
    setFormRole(user.role || 'Staff')
    setFormModules(
      user.modules || (
        user.role === 'Super Admin'
          ? ['products', 'orders', 'analytics', 'content', 'settings']
          : user.role === 'Admin'
          ? ['products', 'orders', 'analytics']
          : ['orders']
      )
    )
    setFormAvatarPhoto(user.photo || null)
    setActiveMenuUserId(null)
    setShowModal(true)
  }

  // Auto-sync modules when role changes in modal
  const handleRoleChange = (newRole) => {
    if (editingUser && editingUser.accountType === 'customer') {
      notify('Staff roles only apply to employee accounts.', 'info')
      return
    }
    setFormRole(newRole)
    if (newRole === 'Super Admin') {
      setFormModules(['products', 'orders', 'analytics', 'content', 'settings'])
    } else if (newRole === 'Admin') {
      setFormModules(['products', 'orders', 'analytics', 'content'])
    } else {
      setFormModules(['orders'])
    }
  }

  // Toggle individual permission module
  const handleToggleModule = (moduleId) => {
    setFormModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((m) => m !== moduleId)
        : [...prev, moduleId]
    )
  }

  // Handle Photo change
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setFormAvatarPhoto(event.target?.result)
      }
      reader.readAsDataURL(file)
    }
  }

  // Split "Juan Dela Cruz" into surname / given name for the employee API.
  const splitFullName = (full) => {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length <= 1) return { givname: parts[0] || '', surname: parts[0] || '' }
    return { givname: parts[0], surname: parts.slice(1).join(' ') }
  }

  const roleToNewType = (role) => {
    if (role === 'Super Admin') return 'SUPER ADMIN'
    if (role === 'Admin') return 'ADMIN'
    return 'STAFF'
  }

  // Save Modal Form — create (employee signup) or update via the accounts API.
  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (isSaving) return
    if (!formName.trim() || !formEmail.trim()) return

    if (!isSuperAdmin) {
      notify('Only the Super Admin may register or edit staff accounts (REQ-UM-01).', 'error')
      return
    }

    setIsSaving(true)
    try {
      if (!editingUser) {
        // ── Register a new staff account (REQ-UM-01 / REQ-UM-04) ──
        // The server mints a one-time temporary password; surface it here.
        const { givname, surname } = splitFullName(formName)
        const { user, error } = await employeeSignUp({
          surname,
          givname,
          email: formEmail.trim(),
          phone: formPhone.trim(),
          studnum: formStudnum.trim(),
          college: formCollege.trim(),
          program: formProgram.trim(),
          year: formYear.trim(),
          bloc: formBloc.trim(),
          type: roleToNewType(formRole),
        })
        if (error) {
          // Surface the server message verbatim; keep the form intact.
          notify(error, 'error')
          return
        }
        recordLog(
          'REGISTER ACCOUNT',
          `Registered staff account ${formEmail.trim()} as ${formRole}`,
          { userId: user?.emp_id, accountType: 'employee' }
        )
        reloadAccounts()
        setTempPassword(user?.temporary_password || '')
        notify(`Staff account for ${formName.trim()} registered.`)
        return
      }

      // ── Edit an existing account (PUT /accounts/update) ──
      const isEmp = editingUser.accountType === 'employee'
      const changes = isEmp
        ? {
            emp_givname: splitFullName(formName).givname,
            emp_surname: splitFullName(formName).surname,
            emp_email: formEmail.trim(),
            emp_phone: formPhone.trim(),
          }
        : {
            cust_nickname: formName.trim(),
            cust_email: formEmail.trim(),
            cust_phone: formPhone.trim(),
          }
      await updateAccount(editingUser.accountType, editingUser.userId, changes)
      recordLog('UPDATE ACCOUNT', `Updated profile details for ${formName.trim()}`, editingUser)

      // Role change → PUT /accounts/type (super admin only, REQ-UM-01)
      if (isEmp && formRole !== editingUser.role) {
        await changeAccountType('employee', editingUser.userId, roleToNewType(formRole))
        recordLog(
          'CHANGE ACCOUNT TYPE',
          `Changed ${editingUser.name} from ${editingUser.role} to ${formRole}`,
          editingUser
        )
      }

      // Status change is routed through the ban (reason required) / recover flow
      let pendingStatusAction = null
      if (formStatus !== editingUser.status) {
        pendingStatusAction = formStatus === 'Inactive' ? 'ban' : 'recover'
      }

      setShowModal(false)
      reloadAccounts()

      if (pendingStatusAction === 'ban') {
        setBanTarget(editingUser)
        setBanReason('')
        notify('Profile saved. A ban reason is required to deactivate this account.', 'info')
      } else if (pendingStatusAction === 'recover') {
        handleRecover(editingUser)
      } else {
        notify('Account updated successfully.')
      }
    } catch (err) {
      notify(errorMessage(err, 'Failed to save the account.'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Ban flow (REQ-UM-02): reason is mandatory ──
  const handleOpenBan = (user) => {
    setActiveMenuUserId(null)
    if (!isSuperAdmin) {
      notify('Only the Super Admin may ban accounts (REQ-UM-01).', 'error')
      return
    }
    setBanTarget(user)
    setBanReason('')
  }

  const handleConfirmBan = async () => {
    if (!banTarget) return
    const reason = banReason.trim()
    if (!reason) {
      notify('A reason is required to ban an account (REQ-UM-04).', 'error')
      return
    }
    setIsSaving(true)
    try {
      await banAccount(banTarget.accountType, banTarget.userId, reason)
      recordLog('BAN ACCOUNT', `Banned ${banTarget.name}. Reason: ${reason}`, banTarget)
      setBanTarget(null)
      setBanReason('')
      reloadAccounts()
      notify(`${banTarget.name} has been banned.`)
    } catch (err) {
      notify(errorMessage(err, 'Failed to ban the account.'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Recover flow ──
  const handleRecover = async (user) => {
    if (!isSuperAdmin) {
      notify('Only the Super Admin may recover accounts (REQ-UM-01).', 'error')
      return
    }
    try {
      await recoverAccount(user.accountType, user.userId)
      recordLog('RECOVER ACCOUNT', `Recovered ${user.name}`, user)
      reloadAccounts()
      notify(`${user.name} has been recovered.`)
    } catch (err) {
      notify(errorMessage(err, 'Failed to recover the account.'), 'error')
    }
  }

  // ── Delete flow (REQ-UM-03): two-step confirmation, irreversible ──
  const handleOpenDelete = (user) => {
    setActiveMenuUserId(null)
    if (!isSuperAdmin) {
      notify('Only the Super Admin may delete accounts (REQ-UM-01).', 'error')
      return
    }
    setDeleteTarget(user)
    setDeleteStep(1)
    setDeleteConfirmText('')
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setIsSaving(true)
    try {
      await deleteAccount(deleteTarget.accountType, deleteTarget.userId)
      recordLog('DELETE ACCOUNT', `Permanently deleted ${deleteTarget.name}`, deleteTarget)
      setDeleteTarget(null)
      setDeleteStep(1)
      setDeleteConfirmText('')
      reloadAccounts()
      notify(`${deleteTarget.name} was deleted.`)
    } catch (err) {
      notify(errorMessage(err, 'Failed to delete the account.'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Toggle user status quickly from action menu → ban / recover flows
  const handleToggleUserStatus = (user) => {
    setActiveMenuUserId(null)
    if (user.status === 'Active') {
      handleOpenBan(user)
    } else {
      handleRecover(user)
    }
  }

  // Helper for avatar colors matching the design
  const getAvatarColors = (user) => {
    const name = user.name || ''
    if (name.includes('Super Admin') || user.avatar === 'SA') {
      return 'bg-[#FFEDD5] text-[#EA580C]'
    }
    if (name.includes('Maria') || user.avatar === 'MS') {
      return 'bg-[#DBEAFE] text-[#2563EB]'
    }
    if (name.includes('Juan') || user.avatar === 'JC') {
      return 'bg-[#EDE9FE] text-[#7C3AED]'
    }
    if (name.includes('Elena') || user.avatar === 'ER') {
      return 'bg-[#CCFBF1] text-[#0D9488]'
    }
    // Color variants based on id or avatarBg
    if (user.avatarBg === 'orange') return 'bg-[#FFEDD5] text-[#EA580C]'
    if (user.avatarBg === 'blue') return 'bg-[#DBEAFE] text-[#2563EB]'
    if (user.avatarBg === 'purple') return 'bg-[#EDE9FE] text-[#7C3AED]'
    if (user.avatarBg === 'teal') return 'bg-[#CCFBF1] text-[#0D9488]'
    return 'bg-[#FFEDD5] text-[#EA580C]'
  }

  // Initials generator
  const getInitials = (name) => {
    if (!name) return 'AD'
    const parts = name.trim().split(' ')
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
              Staff &amp; Admin Accounts
            </h1>
            <p className="text-sm text-slate-500 font-normal mt-1">
              Manage staff privileges and portal accounts for your organization.
            </p>
          </div>

          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBroadcast(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-[#F97316] text-slate-700 font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer w-fit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span>Send Notification</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            disabled={!isSuperAdmin}
            title={isSuperAdmin ? 'Add Staff Account' : 'Only the Super Admin may register staff accounts (REQ-UM-01)'}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer w-fit disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Staff Account</span>
          </button>
          </div>
        </div>

        {/* ── Search & Filter Controls Bar ── */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
          {/* Search Input */}
          <div className="relative flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/90 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange shadow-2xs transition-all"
            />
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 md:pb-0">
            {/* Role Filter Dropdown */}
            <div className="relative">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="appearance-none bg-white border border-slate-200/90 rounded-xl pl-4 pr-9 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-brand-orange shadow-2xs cursor-pointer"
              >
                <option value="All Roles">All Roles</option>
                <option value="Super Admin">Super Admin</option>
                <option value="Admin">Admin</option>
                <option value="Staff">Staff</option>
                <option value="Customer">Customer</option>
              </select>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Status Filter Dropdown */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="appearance-none bg-white border border-slate-200/90 rounded-xl pl-4 pr-9 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-brand-orange shadow-2xs cursor-pointer"
              >
                <option value="All Statuses">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Filters Button */}
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSelectedRole('All Roles')
                setSelectedStatus('All Statuses')
              }}
              title="Reset all filters"
              className="inline-flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-500">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>Filters</span>
            </button>
          </div>
        </div>

        {/* ── Inline status banner (errors / action feedback) ── */}
        {(notice || pageError) && (
          <div
            className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
              notice?.type === 'error' || pageError
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : notice?.type === 'info'
                ? 'bg-sky-50 border-sky-200 text-sky-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <span>{pageError || notice?.text}</span>
            <div className="flex items-center gap-2 shrink-0">
              {pageError && (
                <button
                  type="button"
                  onClick={() => {
                    setPageError('')
                    reloadAccounts()
                  }}
                  className="font-bold underline cursor-pointer"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setNotice(null)}
                title="Dismiss"
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Table Card Container ── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-visible">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                  <th className="py-4 pl-5 pr-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-brand-orange focus:ring-brand-orange cursor-pointer accent-[#F97316]"
                    />
                  </th>
                  <th className="py-4 px-4">STAFF MEMBER</th>
                  <th className="py-4 px-4">ROLE</th>
                  <th className="py-4 px-4">PERMISSIONS SCOPE</th>
                  <th className="py-4 px-4">STATUS</th>
                  <th className="py-4 px-5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-brand-orange animate-spin" />
                        Loading accounts…
                      </span>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      {users.length === 0
                        ? 'No accounts found. They will appear here once registered.'
                        : 'No staff members match the current filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUserIds.includes(user.id)
                    const roleName = user.role || 'Staff'
                    const isSuper = roleName === 'Super Admin'
                    const isAdmin = roleName === 'Admin'
                    const initials = user.avatar || getInitials(user.name)

                    return (
                      <tr
                        key={user.id}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isSelected ? 'bg-orange-50/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-4 pl-5 pr-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(user.id)}
                            className="w-4 h-4 rounded border-slate-300 text-brand-orange focus:ring-brand-orange cursor-pointer accent-[#F97316]"
                          />
                        </td>

                        {/* Staff Member (Avatar + Name + Email) */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            {user.photo ? (
                              <img
                                src={user.photo}
                                alt={user.name}
                                className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-100 shadow-2xs"
                              />
                            ) : (
                              <div
                                className={`w-10 h-10 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${getAvatarColors(
                                  user
                                )}`}
                              >
                                {initials}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-900 text-sm leading-snug">
                                {user.name}
                              </p>
                              <p className="text-xs text-slate-400 font-normal leading-snug">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          {isSuper ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FFF7ED] text-[#EA580C] border border-orange-200/50">
                              {/* Crown Icon */}
                              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[#F97316]">
                                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                              </svg>
                              <span>Super Admin</span>
                            </span>
                          ) : isAdmin ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#D97706] border border-amber-200/50">
                              {/* User Icon */}
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-[#D97706]">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                              <span>Admin</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-slate-200/80">
                              {/* Staff Icon: Shield or User */}
                              {user.name?.includes('Elena') ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-[#64748B]">
                                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-[#64748B]">
                                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                              )}
                              <span>
                                {isAdmin ? 'Admin' : roleName === 'Customer' ? 'Customer' : 'Staff'}
                              </span>
                            </span>
                          )}
                        </td>

                        {/* Permissions Scope */}
                        <td className="py-4 px-4 text-slate-600 font-normal text-xs sm:text-sm">
                          {user.permissions || 'Assigned Modules'}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          {user.status === 'Active' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#ECFDF5] text-[#059669] border border-emerald-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              <span>{user.status === 'Deleted' ? 'Deleted' : 'Inactive'}</span>
                            </span>
                          )}
                        </td>

                        {/* Actions (3-dots vertical button & menu) */}
                        <td className="py-4 px-5 text-right relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveMenuUserId(activeMenuUserId === user.id ? null : user.id)
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Actions"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                              <circle cx="12" cy="6" r="1.75" />
                              <circle cx="12" cy="12" r="1.75" />
                              <circle cx="12" cy="18" r="1.75" />
                            </svg>
                          </button>

                          {/* Popover Menu */}
                          {activeMenuUserId === user.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-5 top-12 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-40 text-left animate-slide-up"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!isSuperAdmin ? (
                                // REQ-UM-01: admin & staff may only view the account list.
                                <span className="block px-3.5 py-2 text-xs font-medium text-slate-400 select-none">
                                  View only — Super Admin required
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(user)}
                                    className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    <span>Edit Member</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(user)}
                                    className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors"
                                  >
                                    <span className={`w-2 h-2 rounded-full ${user.status === 'Active' ? 'bg-rose-400' : 'bg-emerald-500'}`} />
                                    <span>{user.status === 'Active' ? 'Ban Account' : 'Recover Account'}</span>
                                  </button>

                                  {user.status !== 'Deleted' && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDelete(user)}
                                      className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition-colors"
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-rose-500">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                      </svg>
                                      <span>Delete Account</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Table Footer (Count & Pagination) ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 font-medium">
              Showing 1–{filteredUsers.length} of {users.length} accounts
            </p>

            <div className="flex items-center gap-1.5 select-none">
              {/* Previous Button */}
              <button
                type="button"
                disabled
                className="w-8 h-8 rounded-lg border border-slate-200/80 bg-white text-slate-300 flex items-center justify-center cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              {/* Active Page Indicator */}
              <button
                type="button"
                className="w-8 h-8 rounded-lg bg-[#F97316] text-white font-bold text-xs flex items-center justify-center shadow-xs"
              >
                1
              </button>

              {/* Next Button */}
              <button
                type="button"
                disabled
                className="w-8 h-8 rounded-lg border border-slate-200/80 bg-white text-slate-300 flex items-center justify-center cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit / Add Staff Member Modal (Image 2) ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 p-4 sm:p-5 relative animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {editingUser ? 'Edit Staff Member' : 'Add Staff Member'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              {/* 2-Column Content Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 pt-3">
                {/* ── Left Column: Personal Information ── */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-slate-900">
                    Personal Information
                  </h3>

                  {/* Avatar & Change Photo Button */}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {formAvatarPhoto ? (
                        <img
                          src={formAvatarPhoto}
                          alt="Avatar"
                          className="w-10 h-10 rounded-full object-cover border border-white shadow-xs"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#FFEDD5] text-[#EA580C] font-bold text-xs flex items-center justify-center shadow-xs">
                          {editingUser ? editingUser.avatar || getInitials(formName) : getInitials(formName || 'New User')}
                        </div>
                      )}
                      <div className="w-4 h-4 bg-slate-700 text-white rounded-full flex items-center justify-center absolute -bottom-0.5 -right-0.5 ring-1.5 ring-white">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2 h-2">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="3" />
                        </svg>
                      </div>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-slate-500">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>Change Photo</span>
                    </button>
                  </div>

                  {/* Full Name Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Super Admin"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                    />
                  </div>

                  {/* Email Address Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. superadmin@bicol-u.edu.ph"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                    />
                  </div>

                  {/* Phone Number Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Phone Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="+63 912 345 6789"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                    />
                  </div>

                  {/* Employee record fields (required by POST /auth/emp_signup) */}
                  {!editingUser && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Student Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 2021-12345"
                          value={formStudnum}
                          onChange={(e) => setFormStudnum(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          College / Institute <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. College of Arts and Sciences"
                          value={formCollege}
                          onChange={(e) => setFormCollege(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Program <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Bachelor of Science in Information Systems"
                          value={formProgram}
                          onChange={(e) => setFormProgram(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Year <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 3"
                            value={formYear}
                            onChange={(e) => setFormYear(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Bloc <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. A"
                            value={formBloc}
                            onChange={(e) => setFormBloc(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Temporary password minted by the server on registration */}
                  {tempPassword && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <p className="text-[11px] font-bold text-emerald-800">
                        Temporary password — share it securely
                      </p>
                      <p className="font-mono text-sm font-black text-emerald-900 break-all mt-0.5">
                        {tempPassword}
                      </p>
                      <p className="text-[10px] text-emerald-700 mt-1">
                        {formEmail} must change it at first sign-in.
                      </p>
                    </div>
                  )}

                  {/* Status Dropdown */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Status
                    </label>
                    <div className="relative">
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value)}
                        className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange cursor-pointer"
                      >
                        <option value="Active">● Active</option>
                        <option value="Inactive">● Inactive</option>
                      </select>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    {editingUser && formStatus !== editingUser.status && (
                      <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                        {formStatus === 'Inactive'
                          ? 'Deactivating asks for a ban reason next (REQ-UM-02).'
                          : 'Saving will recover this account (REQ-UM-02).'}
                      </p>
                    )}
                  </div>

                  {/* Bottom Information Callout Card */}
                  <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 flex items-start gap-2.5 mt-2">
                    <div className="w-6 h-6 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-900">
                        {formRole}
                      </p>
                      <p className="text-[10px] text-slate-500 font-normal leading-tight mt-0.5">
                        {formRole === 'Super Admin'
                          ? 'Has full access to all features, settings, and system configurations.'
                          : formRole === 'Admin'
                          ? 'Manage users, products, orders, and content.'
                          : 'Limited access to assigned operational modules.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Right Column: Access Rights ── */}
                <div className="space-y-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Access Rights
                    </h3>
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                      Select what this user can access and manage.
                    </p>
                  </div>

                  {/* Role Option 1: Super Admin */}
                  <div
                    onClick={() => handleRoleChange('Super Admin')}
                    className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      formRole === 'Super Admin'
                        ? 'border-orange-400 bg-orange-50/20 ring-1 ring-orange-400/40'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[#F97316]">
                          <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">Super Admin</p>
                        <p className="text-[10px] text-slate-500 font-normal leading-tight">Full system access</p>
                      </div>
                    </div>
                    {/* Radio circle */}
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-500 flex items-center justify-center shrink-0">
                      {formRole === 'Super Admin' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                      )}
                    </div>
                  </div>

                  {/* Role Option 2: Admin */}
                  <div
                    onClick={() => handleRoleChange('Admin')}
                    className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      formRole === 'Admin'
                        ? 'border-orange-400 bg-orange-50/20 ring-1 ring-orange-400/40'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-600">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">Admin</p>
                        <p className="text-[10px] text-slate-500 font-normal leading-tight">Manage users, products, orders, and content</p>
                      </div>
                    </div>
                    {/* Radio circle */}
                    <div
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        formRole === 'Admin' ? 'border-orange-500' : 'border-slate-300'
                      }`}
                    >
                      {formRole === 'Admin' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                      )}
                    </div>
                  </div>

                  {/* Role Option 3: Staff */}
                  <div
                    onClick={() => handleRoleChange('Staff')}
                    className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      formRole === 'Staff'
                        ? 'border-orange-400 bg-orange-50/20 ring-1 ring-orange-400/40'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-600">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">Staff</p>
                        <p className="text-[10px] text-slate-500 font-normal leading-tight">Limited access to assigned modules</p>
                      </div>
                    </div>
                    {/* Radio circle */}
                    <div
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        formRole === 'Staff' ? 'border-orange-500' : 'border-slate-300'
                      }`}
                    >
                      {formRole === 'Staff' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                      )}
                    </div>
                  </div>

                  {/* ── Additional Permissions Checkbox List ── */}
                  <div className="pt-1.5">
                    <p className="text-xs font-bold text-slate-900">
                      Additional Permissions
                    </p>
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5 mb-2">
                      Grant access to specific modules (optional).
                    </p>

                    <div className="space-y-1.5">
                      {SYSTEM_MODULES.map((mod) => {
                        const isChecked = formModules.includes(mod.id)
                        return (
                          <label
                            key={mod.id}
                            className="flex items-start gap-2 cursor-pointer select-none group"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleModule(mod.id)}
                              className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-brand-orange focus:ring-brand-orange cursor-pointer accent-[#F97316]"
                            />
                            <div>
                              <p className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 leading-tight">
                                {mod.label}
                              </p>
                              <p className="text-[10px] text-slate-400 font-normal leading-tight">
                                {mod.desc}
                              </p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 mt-4 border-t border-slate-100">
                {tempPassword ? (
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors shadow-2xs cursor-pointer"
                  >
                    Done
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                      {isSaving ? 'Saving…' : editingUser ? 'Save Changes' : 'Create Account'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Ban Account Modal (reason required — REQ-UM-02 / REQ-UM-04) ── */}
      {banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-4 sm:p-5 relative animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Ban Account</h2>
              <button
                type="button"
                onClick={() => setBanTarget(null)}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="pt-3 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Banning <strong className="text-slate-900">{banTarget.name}</strong> immediately revokes
                their access and terminates active sessions (REQ-UM-02). The reason below is written to
                the management log (REQ-UM-04).
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Reason for ban <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="e.g. Repeated violations of the staff access policy..."
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all resize-none"
                />
                {!banReason.trim() && (
                  <p className="text-[10px] text-slate-400 mt-1">A reason is required to ban an account.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBanTarget(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBan}
                disabled={!banReason.trim() || isSaving}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Banning…' : 'Ban Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account Modal (two-step confirmation — REQ-UM-03) ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-4 sm:p-5 relative animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {deleteStep === 1 ? 'Delete Account' : 'Confirm Permanent Deletion'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteStep(1)
                  setDeleteConfirmText('')
                }}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="pt-3 space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-rose-500 shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-xs text-rose-700 leading-relaxed">
                  {deleteStep === 1 ? (
                    <>
                      You are about to delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email}).
                      Deletion is <strong>permanent and cannot be undone</strong> — all data associated with
                      this account is purged (REQ-UM-03).
                    </>
                  ) : (
                    <>
                      This is the final step. Type <strong>DELETE</strong> below to permanently remove{' '}
                      <strong>{deleteTarget.name}</strong> and purge all associated data (REQ-UM-03).
                    </>
                  )}
                </p>
              </div>

              {deleteStep === 2 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Type DELETE to confirm <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 transition-all"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteStep(1)
                  setDeleteConfirmText('')
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {deleteStep === 1 ? 'Cancel' : 'Back'}
              </button>
              {deleteStep === 1 ? (
                <button
                  type="button"
                  onClick={() => setDeleteStep(2)}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-2xs cursor-pointer"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || isSaving}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Deleting…' : 'Delete Forever'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <BroadcastNotificationDrawer
        isOpen={showBroadcast}
        onClose={() => setShowBroadcast(false)}
        accounts={users}
        onSent={(count, type) =>
          showToast(
            `Notification sent to ${count} ${type === 'customer' ? 'customer' : 'employee'}${count === 1 ? '' : 's'}.`,
            'success'
          )
        }
      />
    </AdminLayout>
  )
}
