import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import defaultAvatar from '../../assets/avatar.png'

export default function AdminAccount() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const {
    currentAdminUser,
    updateCurrentAdminProfile,
    switchAdminUser,
    adminState,
  } = useAdmin()

  // Form state
  const [firstName, setFirstName] = useState(
    currentAdminUser?.firstName || (currentAdminUser?.name ? currentAdminUser.name.split(' ')[0] : 'Maria')
  )
  const [lastName, setLastName] = useState(
    currentAdminUser?.lastName || (currentAdminUser?.name ? currentAdminUser.name.split(' ').slice(1).join(' ') : 'Santos')
  )
  const [email, setEmail] = useState(
    currentAdminUser?.email || 'm.santos@tindahan.nisko.edu.ph'
  )
  const [avatarPreview, setAvatarPreview] = useState(
    currentAdminUser?.avatarImage || defaultAvatar
  )
  const [isEmailEditable, setIsEmailEditable] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  // Password Modal fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const fileInputRef = useRef(null)

  // Keep state synchronized if user changes
  useEffect(() => {
    if (currentAdminUser) {
      setFirstName(
        currentAdminUser.firstName ||
          (currentAdminUser.name ? currentAdminUser.name.split(' ')[0] : '')
      )
      setLastName(
        currentAdminUser.lastName ||
          (currentAdminUser.name ? currentAdminUser.name.split(' ').slice(1).join(' ') : '')
      )
      setEmail(currentAdminUser.email || '')
      setAvatarPreview(currentAdminUser.avatarImage || defaultAvatar)
    }
  }, [currentAdminUser])

  // Handle avatar file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif'].includes(file.type)) {
      showToast('Please upload a valid PNG, JPEG, or GIF image.', 'error')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image size exceeds the 10MB limit.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result
      if (dataUrl) {
        setAvatarPreview(dataUrl)
        showToast('Image preview loaded. Click Save to apply.', 'info')
      }
    }
    reader.readAsDataURL(file)
  }

  // Remove avatar
  const handleRemoveAvatar = () => {
    setAvatarPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    showToast('Profile picture removed. Click Save to confirm.', 'info')
  }

  // Save profile changes
  const handleSave = () => {
    const cleanFirst = firstName.trim()
    const cleanLast = lastName.trim()
    const cleanEmail = email.trim()

    if (!cleanFirst || !cleanLast) {
      showToast('Please provide both first and last name.', 'error')
      return
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('Please provide a valid email address.', 'error')
      return
    }

    const fullName = `${cleanFirst} ${cleanLast}`
    const initials = `${cleanFirst[0] || ''}${cleanLast[0] || ''}`.toUpperCase()

    updateCurrentAdminProfile({
      firstName: cleanFirst,
      lastName: cleanLast,
      name: fullName,
      email: cleanEmail,
      avatar: initials,
      avatarImage: avatarPreview,
    })

    setIsEmailEditable(false)
    showToast('Account profile updated successfully!', 'success')
  }

  // Cancel changes
  const handleCancel = () => {
    if (currentAdminUser) {
      setFirstName(
        currentAdminUser.firstName ||
          (currentAdminUser.name ? currentAdminUser.name.split(' ')[0] : 'Maria')
      )
      setLastName(
        currentAdminUser.lastName ||
          (currentAdminUser.name ? currentAdminUser.name.split(' ').slice(1).join(' ') : 'Santos')
      )
      setEmail(currentAdminUser.email || 'm.santos@tindahan.nisko.edu.ph')
      setAvatarPreview(currentAdminUser.avatarImage || defaultAvatar)
      setIsEmailEditable(false)
    }
    showToast('Changes reverted.', 'info')
  }

  // Password change submission
  const handleChangePassword = (e) => {
    e.preventDefault()
    setPasswordError('')

    if (!currentPassword) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    // Success simulation
    setShowPasswordModal(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    showToast('Password updated successfully!', 'success')
  }

  const isSuperAdmin = currentAdminUser?.roleKey === 'SUPER_ADMIN'

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto py-2 sm:py-4 px-2 sm:px-4 space-y-6 animate-fade-in">
        {/* Page Heading */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Account
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage your profile and account settings.
          </p>
        </div>

        {/* Superadmin banner with role switcher */}
        {isSuperAdmin && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-600 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                You are currently viewing as <strong>Super Admin (Root Account)</strong>. This profile view is configured for Store Administrators and Staff members.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => switchAdminUser('usr-2')}
                className="px-3 py-1.5 rounded-lg bg-brand-orange text-white font-bold text-[11px] hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Switch to Maria Santos (Admin)
              </button>
              <button
                type="button"
                onClick={() => switchAdminUser('usr-3')}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold text-[11px] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Switch to Juan Cruz (Staff)
              </button>
            </div>
          </div>
        )}

        {/* Main Profile Card matching design exactly */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-7 shadow-2xs">
          {/* 1. Profile Picture Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900">
              Profile Picture
            </h2>

            <div className="flex items-center gap-5 sm:gap-6">
              {/* Avatar Preview */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-slate-100 bg-slate-100 flex items-center justify-center shrink-0">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={currentAdminUser?.name || 'Staff Avatar'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-brand-orange text-white text-xl sm:text-2xl font-black flex items-center justify-center">
                    {currentAdminUser?.avatar || 'MS'}
                  </div>
                )}
              </div>

              {/* Action Buttons & Note */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/gif"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-orange-600 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Upload Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  >
                    Remove
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  We support PNGs, JPEGs and GIFs under 10MB.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Names Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange transition-all"
              />
            </div>
          </div>

          {/* 3. Email Section */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Email
            </label>
            <div className="flex items-center gap-3">
              <input
                type="email"
                value={email}
                disabled={!isEmailEditable}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={`flex-1 h-10 px-3.5 rounded-lg border text-xs sm:text-sm transition-all ${
                  isEmailEditable
                    ? 'border-brand-orange bg-white text-slate-900 focus:ring-2 focus:ring-brand-orange/20'
                    : 'border-slate-200 bg-slate-50/70 text-slate-700 cursor-not-allowed'
                }`}
              />
              <button
                type="button"
                onClick={() => setIsEmailEditable((prev) => !prev)}
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer shrink-0 shadow-2xs"
              >
                {isEmailEditable ? 'Lock Email' : 'Edit Email'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Used to log in to your account
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-100 my-4" />

          {/* 4. Password Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Password
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Log in with your password instead of using temporary login codes.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer self-start sm:self-auto shadow-2xs shrink-0"
            >
              Change Password
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-100 my-4" />

          {/* 5. Bottom Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2 rounded-lg bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs active:scale-98"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* ── CHANGE PASSWORD MODAL ── */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Change Password</h3>
                <p className="text-xs text-slate-400">Update your staff account access password</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {passwordError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {passwordError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:border-brand-orange"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:border-brand-orange"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:border-brand-orange"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-brand-orange text-white hover:bg-orange-600 font-bold"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
