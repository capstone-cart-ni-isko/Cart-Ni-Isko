import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'

// Available modules for granular permissions
const SYSTEM_MODULES = [
  { id: 'products', label: 'Products', desc: 'Manage products, categories, and inventory' },
  { id: 'orders', label: 'Orders', desc: 'View and manage orders' },
  { id: 'analytics', label: 'Analytics', desc: 'Access analytics and reports' },
  { id: 'content', label: 'Content', desc: 'Manage website content and pages' },
  { id: 'settings', label: 'Settings', desc: 'Manage system settings' },
]

export default function AdminUsers() {
  const {
    adminState,
    addAdminUser,
    updateAdminUser,
    deleteAdminUser,
  } = useAdmin()

  const users = adminState.adminUsers || []

  // Table filters & search state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('All Roles')
  const [selectedStatus, setSelectedStatus] = useState('All Statuses')
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [activeMenuUserId, setActiveMenuUserId] = useState(null)
  const menuRef = useRef(null)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  // Modal Form State
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
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

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim()
      const matchSearch =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.permissions && u.permissions.toLowerCase().includes(q))

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
    setEditingUser(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
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
    setFormPhone(user.phone || '+63 912 345 6789')
    setFormStatus(user.status || 'Active')
    setFormRole(user.role || 'Super Admin')
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

  // Save Modal Form
  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (!formName.trim() || !formEmail.trim()) return

    // Derive permissions scope text
    let scopeText = 'Limited Access'
    if (formRole === 'Super Admin') {
      scopeText = 'Full System Access'
    } else if (formRole === 'Admin') {
      scopeText = 'Products, Orders, Inventory, Schedule'
    } else if (formRole === 'Staff') {
      if (formModules.includes('products')) {
        scopeText = 'Products, Fulfillment, POS'
      } else {
        scopeText = 'Fulfillment, Orders, POS'
      }
    }

    const payload = {
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim() || '+63 912 345 6789',
      role: formRole,
      status: formStatus,
      permissions: scopeText,
      modules: formModules,
      photo: formAvatarPhoto,
    }

    if (editingUser) {
      updateAdminUser(editingUser.id, payload)
    } else {
      addAdminUser(payload)
    }

    setShowModal(false)
  }

  // Toggle user status quickly from action menu
  const handleToggleUserStatus = (user) => {
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active'
    updateAdminUser(user.id, { status: newStatus })
    setActiveMenuUserId(null)
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

          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer w-fit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Staff Account</span>
          </button>
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
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No staff members match the current filter.
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
                              <span>Staff</span>
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
                              <span>Inactive</span>
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
                                <span className={`w-2 h-2 rounded-full ${user.status === 'Active' ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                                <span>{user.status === 'Active' ? 'Deactivate' : 'Activate'}</span>
                              </button>

                              {!user.isOriginal && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Revoke staff access for ${user.name}?`)) {
                                      deleteAdminUser(user.id)
                                      setActiveMenuUserId(null)
                                    }
                                  }}
                                  className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-rose-500">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                  </svg>
                                  <span>Revoke Access</span>
                                </button>
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
              Showing 1–{filteredUsers.length} of {users.length} staff members
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
                      Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="+63 912 345 6789"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                    />
                  </div>

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
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors shadow-2xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
