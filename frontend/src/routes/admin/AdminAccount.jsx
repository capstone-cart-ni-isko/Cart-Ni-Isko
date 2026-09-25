import { useState, useRef, useEffect } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import { fetchAccounts, updateAccount } from '../../services/accounts.js'
import { updateCredentials } from '../../services/auth.js'
import { uploadImage } from '../../services/upload.js'

export default function AdminAccount() {
  const { showToast } = useToast()
  const {
    currentAdminUser,
    logoutAdmin,
    updateCurrentAdminProfile,
  } = useAdmin()

  // The signed-in employee's own record (authoritative emp_id / field values)
  const [record, setRecord] = useState(null)
  const [isLoadingRecord, setIsLoadingRecord] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [firstName, setFirstName] = useState(
    currentAdminUser?.firstName || (currentAdminUser?.name ? currentAdminUser.name.split(' ')[0] : 'Maria')
  )
  const [lastName, setLastName] = useState(
    currentAdminUser?.lastName || (currentAdminUser?.name ? currentAdminUser.name.split(' ').slice(1).join(' ') : 'Santos')
  )
  const [email, setEmail] = useState(
    currentAdminUser?.email || ''
  )
  const [avatarPreview, setAvatarPreview] = useState(
    currentAdminUser?.avatarImage || ''
  )
  const [isEmailEditable, setIsEmailEditable] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  // Password Modal fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  const fileInputRef = useRef(null)

  // Load the backend row for the signed-in employee (REQ-APC-02)
  useEffect(() => {
    let cancelled = false
    setIsLoadingRecord(true)
    fetchAccounts({ account_type: 'employee' })
      .then((payload) => {
        if (cancelled) return
        const rows = Array.isArray(payload)
          ? payload.filter((r) => r.emp_id != null)
          : Array.isArray(payload?.employees)
          ? payload.employees
          : []
        const id = currentAdminUser?.id
        const found =
          rows.find((r) => String(r.emp_id) === String(id)) ||
          rows.find((r) => r.emp_email && r.emp_email === currentAdminUser?.email) ||
          null
        setRecord(found)
        if (found) {
          setFirstName(found.emp_givname || '')
          setLastName(found.emp_surname || '')
          setEmail(found.emp_email || '')
        }
        setIsLoadingRecord(false)
      })
      .catch(() => {
        // Fall back to the context values already in the form.
        if (!cancelled) setIsLoadingRecord(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle avatar file selection → real file upload to backend storage
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.type)) {
      showToast('Please upload a valid PNG, JPEG, GIF, or WebP image.', 'error')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image size exceeds the 10MB limit.', 'error')
      return
    }

    try {
      showToast('Uploading image…', 'info')
      const url = await uploadImage(file, 'avatar')
      setAvatarPreview(url)
      showToast('Image uploaded. Click Save to apply.', 'success')
    } catch (err) {
      showToast(err?.message || 'Unable to upload the image.', 'error')
    }
  }

  // Remove avatar
  const handleRemoveAvatar = () => {
    setAvatarPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    showToast('Profile picture removed. Click Save to confirm.', 'info')
  }

  // Save profile changes → PUT /accounts/update (REQ-APC-02)
  const handleSave = async () => {
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

    const empId = record?.emp_id ?? currentAdminUser?.id
    if (empId == null) {
      showToast('Unable to resolve your account record. Please reload.', 'error')
      return
    }

    setIsSaving(true)
    try {
      await updateAccount('employee', empId, {
        emp_givname: cleanFirst,
        emp_surname: cleanLast,
        emp_email: cleanEmail,
        emp_photo: avatarPreview || null,
      })

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

      setRecord((prev) => ({
        ...(prev || {}),
        emp_id: empId,
        emp_givname: cleanFirst,
        emp_surname: cleanLast,
        emp_email: cleanEmail,
        emp_photo: avatarPreview || null,
      }))
      setIsEmailEditable(false)
      showToast('Account profile updated successfully!', 'success')
    } catch (err) {
      // Inputs stay as typed so the admin can correct and retry (REQ-APC-02).
      showToast(err?.message || 'Failed to update the account profile.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Cancel changes
  const handleCancel = () => {
    if (record) {
      setFirstName(record.emp_givname || '')
      setLastName(record.emp_surname || '')
      setEmail(record.emp_email || '')
    } else if (currentAdminUser) {
      setFirstName(currentAdminUser.firstName || (currentAdminUser.name ? currentAdminUser.name.split(' ')[0] : ''))
      setLastName(currentAdminUser.lastName || (currentAdminUser.name ? currentAdminUser.name.split(' ').slice(1).join(' ') : ''))
      setEmail(currentAdminUser.email || '')
      setAvatarPreview(currentAdminUser.avatarImage || '')
    }
    setIsEmailEditable(false)
    showToast('Changes reverted.', 'info')
  }

  // Password change submission → PUT /auth/update_credentials (REQ-APC-01)
  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')

    if (!currentPassword) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setIsUpdatingPassword(true)
    const { error } = await updateCredentials({
      current_password: currentPassword,
      new_password: newPassword,
    })
    setIsUpdatingPassword(false)

    if (error) {
      // Surface the backend message verbatim — includes the SRS 30-day
      // lockout response (REQ-APC-01). Keep the fields so the admin can retry.
      setPasswordError(error)
      return
    }

    // Success: close and clear only then (REQ-APC-02)
    setShowPasswordModal(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    showToast('Password updated. Please sign in again.', 'success')
    logoutAdmin()
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
              <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold text-[11px]">
                Root account · profile edits apply to your employee record
              </span>
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
                <Avatar
                  src={avatarPreview}
                  name={currentAdminUser?.name || 'MS'}
                  size={avatarPreview ? 88 : 88}
                  className="w-full h-full"
                  userId={currentAdminUser?.id}
                />
              </div>

              {/* Action Buttons & Note */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/gif,image/webp"
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
              disabled={isSaving || isLoadingRecord}
              className="px-6 py-2 rounded-lg bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save'}
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
                  placeholder="At least 8 characters"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:border-brand-orange"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Sensitive credentials cannot be changed within 30 days of the most recent change (REQ-APC-01).
                </p>
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
                  disabled={isUpdatingPassword}
                  className="px-4 py-2 rounded-lg bg-brand-orange text-white hover:bg-orange-600 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdatingPassword ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
