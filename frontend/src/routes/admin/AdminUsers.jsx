import React, { useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'

export default function AdminUsers() {
  const {
    adminState,
    isSuperAdmin,
    currentAdminUser,
    addAdminUser,
    updateAdminUser,
    deleteAdminUser,
  } = useAdmin()

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  // Form fields
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState('Store Manager')
  const [formPassword, setFormPassword] = useState('')

  const users = adminState.adminUsers || []

  const handleOpenAdd = () => {
    setEditingUser(null)
    setFormName('')
    setFormEmail('')
    setFormRole('Store Manager')
    setFormPassword('')
    setShowAddModal(true)
  }

  const handleOpenEdit = (user) => {
    setEditingUser(user)
    setFormName(user.name)
    setFormEmail(user.email)
    setFormRole(user.role)
    setFormPassword('')
    setShowAddModal(true)
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (!formName.trim() || !formEmail.trim()) return

    if (editingUser) {
      updateAdminUser(editingUser.id, {
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
      })
    } else {
      addAdminUser({
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        password: formPassword || 'temp123',
      })
    }

    setShowAddModal(false)
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
              Staff &amp; Admin Accounts
            </h1>
            <p className="text-xs lg:text-sm font-medium text-gray-500 mt-1">
              Super Admin authority console • Manage staff privileges and portal accounts.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Staff Account</span>
            </button>
          </div>
        </div>

        {/* Super Admin Status Banner */}
        <div className="bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent p-5 rounded-2xl border border-orange-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-brand-orange text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-gray-900">
                  {currentAdminUser?.name || 'Super Admin'}
                </h3>
                <span className="bg-brand-orange text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                  Original Master Account
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Full authority over all store operations, POS registers, logistics logs, and account creation.
              </p>
            </div>
          </div>
        </div>

        {/* Staff Accounts Data Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900">
              Active Authorized Officers ({users.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                  <th className="py-3.5 px-5">STAFF MEMBER</th>
                  <th className="py-3.5 px-5">ROLE</th>
                  <th className="py-3.5 px-5">PERMISSIONS SCOPE</th>
                  <th className="py-3.5 px-5">STATUS</th>
                  <th className="py-3.5 px-5 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 text-brand-orange font-black text-xs flex items-center justify-center shrink-0">
                          {user.avatar}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{user.name}</p>
                          <p className="text-[11px] text-gray-400 font-medium">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-5">
                      <span className="font-bold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg">
                        {user.role}
                      </span>
                    </td>

                    <td className="py-3.5 px-5 text-gray-600 font-medium">
                      {user.permissions}
                    </td>

                    <td className="py-3.5 px-5">
                      <StatusPill status={user.status} />
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      {user.isOriginal ? (
                        <span className="text-[10px] font-bold text-gray-400 italic">
                          Protected Account
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(user)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-orange hover:bg-orange-50 transition-colors"
                            title="Edit Role"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Remove staff access for ${user.name}?`)) {
                                deleteAdminUser(user.id)
                              }
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Revoke Access"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Staff Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-900">
                {editingUser ? 'Edit Staff Privileges' : 'Authorize New Staff Member'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3.5 text-xs font-medium">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Carlos Mendoza"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Bicol University Email</label>
                <input
                  type="email"
                  required
                  placeholder="carlos.mendoza@bicol-u.edu.ph"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Role Assignment</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="Store Manager">Store Manager (Products &amp; Inventory)</option>
                  <option value="Logistics Officer">Logistics Officer (Fulfillment &amp; Claims)</option>
                  <option value="POS Cashier">POS Cashier (In-Store Register)</option>
                  <option value="Reviews Moderator">Reviews Moderator (Customer Support)</option>
                  <option value="Super Admin">Super Admin (Full Authority)</option>
                </select>
              </div>

              {!editingUser && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Temporary Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-orange rounded-xl font-black text-white hover:bg-brand-orange-dark shadow-xs"
                >
                  {editingUser ? 'Update Account' : 'Grant Staff Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
