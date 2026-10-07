import { useState, useRef, useEffect, Fragment } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import OtpVerifyModal from '../../components/ui/OtpVerifyModal.jsx'
import { fetchAccounts, updateAccount } from '../../services/accounts.js'
import { updateCredentials, updateBackupCredentials } from '../../services/auth.js'
import { first, empCateg, empFullName } from '../../components/admin/schema.js'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB
const PRONOUNS = ['they/them', 'he/him', 'she/her', 'other']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Digits in the E.164 range, optionally written with +, spaces, dashes or
    parentheses. An empty value is allowed - the phone fields are optional. */
function isValidPhone(value) {
  const text = String(value || '').trim()
  if (!text) return true
  if (!/^[+\d][\d\s().-]*$/.test(text)) return false
  const digits = text.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

/** Rule 67 - the message for a field sits directly beneath that field. */
function FieldError({ message }) {
  if (!message) return null
  return (
    <p className="text-[11px] font-medium text-rose-600 mt-1" role="alert">
      {message}
    </p>
  )
}

const CATEGORY_LABEL = {
  staff: 'Staff',
  admin: 'Admin',
  'super admin': 'Super Admin',
}

export default function AdminAccount({ embedded = false }) {
  const { showToast } = useToast()
  const { currentAdminUser, logoutAdmin, updateCurrentAdminProfile } = useAdmin()

  // The signed-in employee's own record (authoritative emp_id / field values)
  const [record, setRecord] = useState(null)
  const [isLoadingRecord, setIsLoadingRecord] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [givenName, setGivenName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pronoun, setPronoun] = useState('they/them')
  const [category, setCategory] = useState('staff')
  const [avatarPreview, setAvatarPreview] = useState('')

  /*
      Rules 66 & 67 — validation is realtime and every message renders under
      its own field. `touched` keeps a freshly opened, untouched form quiet;
      from the first edit on, each field's verdict recomputes on every
      keystroke, so an invalid value never has to wait for a submit (or a
      toast) to be pointed out.
  */
  const [touched, setTouched] = useState({})
  const touch = (name) =>
    setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }))
  const touchAll = (names) =>
    setTouched((prev) => names.reduce((acc, name) => ({ ...acc, [name]: true }), prev))

  // Password modal state (DOMAIN 15 — personal password change)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  // FLOW-EMP_LOGOUT-02: every sign-out asks first, wherever it is started.
  const [confirmLogout, setConfirmLogout] = useState(false)

  // FLOW-EMP_SET-03 - backup phone / email used for account recovery.
  const [backupPhone, setBackupPhone] = useState('')
  const [backupEmail, setBackupEmail] = useState('')
  const [isSavingBackup, setIsSavingBackup] = useState(false)

  // REQ-CUST_SET-02's admin-side twin: every sensitive change clears a
  // six-digit code first. Customers get it on the phone channel; employees
  // get it in their Bicol University mailbox (email is the staff channel).
  const [otpOpen, setOtpOpen] = useState(false)
  const [otpPurpose, setOtpPurpose] = useState('password_change')
  const [pendingAction, setPendingAction] = useState(null) // 'password' | 'backup'

  const fileInputRef = useRef(null)

  // Load the backend row for the signed-in employee
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
        if (found) {
          setRecord(found)
          setGivenName(String(first(found, 'emp_givname') || ''))
          setSurname(String(first(found, 'emp_surname') || ''))
          setEmail(String(first(found, 'emp_email') || ''))
          setPhone(String(first(found, 'emp_phone') || ''))
          setPronoun(String(first(found, 'emp_pronoun') || 'they/them'))
          setCategory(empCateg(found))
          setAvatarPreview(String(first(found, 'emp_avatar', 'emp_photo') || ''))
          setBackupPhone(String(first(found, 'emp_backupphone') || ''))
          setBackupEmail(String(first(found, 'emp_backupemail') || ''))
        } else {
          setGivenName(currentAdminUser?.firstName || '')
          setSurname(currentAdminUser?.lastName || currentAdminUser?.surname || '')
          setEmail(currentAdminUser?.email || '')
          setPhone(currentAdminUser?.phone || '')
          setPronoun(currentAdminUser?.pronoun || 'they/them')
          setCategory(empCateg(currentAdminUser))
          setAvatarPreview(currentAdminUser?.avatarImage || '')
          setBackupPhone(String(currentAdminUser?.backupPhone || ''))
          setBackupEmail(String(currentAdminUser?.backupEmail || ''))
        }
        setIsLoadingRecord(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoadingRecord(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // REQ-EMP_PROF-01 — regular staff may not edit their email address.
  const isRegularStaff = empCateg(record || currentAdminUser || {}) === 'staff'
  const isEmailEditable = !isRegularStaff

  /* Rule 66 — the verdict for every field, recomputed from the live values. */
  const profileErrors = {
    givenName: givenName.trim() ? '' : 'Provide a given name.',
    surname: surname.trim() ? '' : 'Provide a surname.',
    email: EMAIL_RE.test(email.trim()) ? '' : 'Provide a valid email address.',
    phone: isValidPhone(phone) ? '' : 'Use a valid phone number, e.g. +63 912 345 6789.',
  }
  const passwordErrors = {
    currentPassword: currentPassword ? '' : 'Enter your current password.',
    newPassword:
      newPassword.length >= 8 ? '' : 'The new password must be at least 8 characters.',
    confirmPassword: !confirmPassword
      ? 'Re-enter the new password.'
      : confirmPassword === newPassword
        ? ''
        : 'The new passwords do not match.',
  }
  const backupErrors = {
    backupPhone: isValidPhone(backupPhone)
      ? ''
      : 'Use a valid phone number, e.g. +63 912 345 6789.',
    backupEmail:
      !backupEmail.trim() || EMAIL_RE.test(backupEmail.trim())
        ? ''
        : 'Provide a valid backup email address.',
  }

  /**
   * Rule 67 — only fields the employee has actually been into report back.
   * A non-empty value that is already invalid counts as "been into" too, so
   * "not-an-email" is called out on the keystroke that made it wrong rather
   * than a blur later; a blank required field stays quiet until touched.
   */
  const liveError = (group, name, raw) =>
    touched[name] || String(raw ?? '').trim() !== '' ? group[name] : ''
  const hasProfileError = Object.values(profileErrors).some(Boolean)
  const hasBackupError = Object.values(backupErrors).some(Boolean)

  // Avatar upload: jpg/png only, <= 2 MB, stored as a base64 data URL
  // in the emp_avatar column (no Supabase buckets exist).
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      showToast('Only JPG and PNG images are allowed for the avatar.', 'error')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showToast('The avatar must be 2 MB or smaller.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarPreview(String(reader.result || ''))
      showToast('Avatar selected. Click Save Profile to apply.', 'success')
    }
    reader.onerror = () => showToast('Could not read the selected image.', 'error')
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveAvatar = () => {
    setAvatarPreview('')
    showToast('Avatar removed. Click Save Profile to apply.', 'info')
  }

  // Save profile → PUT /accounts/update
  const handleSave = async () => {
    // Rule 67: a failed check lights up the offending field itself, not just
    // a toast that disappears.
    touchAll(['givenName', 'surname', 'email', 'phone'])
    if (hasProfileError) return

    const cleanGiven = givenName.trim()
    const cleanSurname = surname.trim()
    const cleanEmail = email.trim()
    const cleanPhone = phone.trim()

    const empId = record?.emp_id ?? currentAdminUser?.id
    if (empId == null) {
      showToast('Unable to resolve your account record. Please reload.', 'error')
      return
    }

    setIsSaving(true)
    try {
      await updateAccount('employee', empId, {
        emp_givname: cleanGiven,
        emp_surname: cleanSurname,
        emp_email: cleanEmail,
        emp_phone: cleanPhone,
        emp_pronoun: pronoun,
        emp_avatar: avatarPreview || null,
      })

      const fullName = `${cleanGiven} ${cleanSurname}`
      const initials = `${cleanGiven[0] || ''}${cleanSurname[0] || ''}`.toUpperCase()

      updateCurrentAdminProfile({
        firstName: cleanGiven,
        lastName: cleanSurname,
        surname: cleanSurname,
        name: fullName,
        email: cleanEmail,
        phone: cleanPhone,
        pronoun,
        avatar: initials,
        avatarImage: avatarPreview,
      })

      setRecord((prev) => ({
        ...(prev || {}),
        emp_id: empId,
        emp_givname: cleanGiven,
        emp_surname: cleanSurname,
        emp_email: cleanEmail,
        emp_phone: cleanPhone,
        emp_pronoun: pronoun,
        emp_avatar: avatarPreview || null,
      }))
      showToast('Account profile updated successfully!', 'success')
    } catch (err) {
      // Inputs stay as typed so the employee can correct and retry.
      showToast(err?.message || 'Failed to update the account profile.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (record) {
      setGivenName(String(first(record, 'emp_givname') || ''))
      setSurname(String(first(record, 'emp_surname') || ''))
      setEmail(String(first(record, 'emp_email') || ''))
      setPhone(String(first(record, 'emp_phone') || ''))
      setPronoun(String(first(record, 'emp_pronoun') || 'they/them'))
      setCategory(empCateg(record))
      setAvatarPreview(String(first(record, 'emp_avatar', 'emp_photo') || ''))
    }
    showToast('Changes reverted.', 'info')
  }

  // Password change → PUT /auth/update_credentials
  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')

    // Rules 66 & 67: every rule is checked continuously, so pressing
    // "Update password" with a weak field simply reveals the message that
    // field has been carrying.
    touchAll(['currentPassword', 'newPassword', 'confirmPassword'])
    if (
      passwordErrors.currentPassword ||
      passwordErrors.newPassword ||
      passwordErrors.confirmPassword
    ) {
      return
    }

    // The server answers 428 OTP_REQUIRED until the emailed code clears, so
    // the sheet goes up first and the change is sent from `onVerified`.
    setPendingAction('password')
    setOtpPurpose('password_change')
    setOtpOpen(true)
  }

  /** Runs once the email OTP is accepted (and again after a 428 retry). */
  const savePassword = async () => {
    setIsUpdatingPassword(true)
    const result = await updateCredentials({
      account_type: 'employee',
      user_id: record?.emp_id ?? currentAdminUser?.id,
      current_password: currentPassword,
      // REQ-EMP_SET-01: `new_password` is the key InputValidatorAPI and
      // AuthAPI::updateCredentials read; `password` is kept as the legacy
      // alias so either spelling is accepted server-side.
      new_password: newPassword,
      password: newPassword,
    })
    setIsUpdatingPassword(false)

    if (result.error) {
      // The gate answers 428 OTP_REQUIRED while the emailed code is still
      // outstanding - most often because the 10-minute window expired. Raise
      // the sheet again rather than leaving the employee stuck on a message.
      if (result.code === 'OTP_REQUIRED' || /OTP_REQUIRED|Verification is required/i.test(result.error)) {
        setPasswordError('')
        setPendingAction('password')
        setOtpPurpose('password_change')
        setOtpOpen(true)
      } else {
        setPasswordError(result.error)
      }
      return
    }

    setShowPasswordModal(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    // AuthAPI::updateCredentials revokes every token of the account, so the
    // session cannot survive the change - end it here and send the employee
    // back to the login form (FLOW-EMP_LOGOUT-04).
    showToast('Password updated successfully. Please sign in again.', 'success')
    logoutAdmin()
  }

  // FLOW-EMP_SET-03 - backup contact information used for account recovery.
  const handleSaveBackup = async () => {
    touchAll(['backupPhone', 'backupEmail'])
    if (hasBackupError) return

    // REQ-CUST_SET-02 / FLOW-EMP_SET-03: the emailed code comes first.
    setPendingAction('backup')
    setOtpPurpose('backup_contacts')
    setOtpOpen(true)
  }

  /** Runs once the email OTP for `backup_contacts` is accepted. */
  const saveBackupContacts = async () => {
    const cleanPhone = backupPhone.trim()
    const cleanEmail = backupEmail.trim()

    setIsSavingBackup(true)
    // Empty fields are simply left out: AuthAPI::backupCredentials keeps the
    // stored value for anything the request does not carry.
    const payload = { backupcallcode: '+63' }
    if (cleanPhone) payload.backupphone = cleanPhone
    if (cleanEmail) payload.backupemail = cleanEmail
    const { error } = await updateBackupCredentials(payload)
    setIsSavingBackup(false)

    if (error) {
      showToast(error, 'error')
      return
    }
    showToast('Backup contacts updated.', 'success')
  }

  /** Hands the queued action to the server once its code has cleared. */
  const handleOtpVerified = async () => {
    setOtpOpen(false)
    const action = pendingAction
    setPendingAction(null)
    if (action === 'password') await savePassword()
    else if (action === 'backup') await saveBackupContacts()
  }

  /*
      FLOW-EMP_PROF-01 / FLOW-EMP_SET-01 — the ribbon's "settings" icon opens
      the settings screen, which embeds this very profile screen; "/admin/account"
      renders it on its own with the layout around it.
  */
  const Wrapper = embedded ? Fragment : AdminLayout

  return (
    <Wrapper>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
            Employee Profile
          </h1>
          <p className="text-sm text-slate-500 font-normal mt-1">
            Your staff identity and how you appear across the portal.
          </p>
        </div>

        {isLoadingRecord ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 text-xs text-slate-400">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-brand-orange animate-spin" />
              Loading profile…
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Identity card */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col items-center text-center space-y-3">
              <Avatar
                src={avatarPreview}
                name={empFullName(record || {}) || currentAdminUser?.name || 'Employee'}
                size={88}
                className="border border-slate-200"
                userId={record?.emp_id ?? currentAdminUser?.id}
              />
              <div>
                <p className="text-base font-bold text-slate-900">
                  {empFullName(record || {}) || `${givenName} ${surname}`.trim() || '—'}
                </p>
                <p className="text-xs text-slate-400">{email || '—'}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-brand-orange border border-orange-200/60">
                {CATEGORY_LABEL[category] || 'Staff'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                ID: {record?.emp_id ?? currentAdminUser?.id ?? '—'}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-500">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Change avatar</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleFileChange}
                className="hidden"
              />
              <p className="text-[10px] text-slate-400">JPG or PNG · max 2 MB</p>
            </section>

            {/* Editable fields */}
            <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Profile details</h2>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    Remove avatar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Given name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={givenName}
                    onChange={(e) => setGivenName(e.target.value)}
                    onBlur={() => touch('givenName')}
                    aria-invalid={!!liveError(profileErrors, 'givenName', givenName)}
                    placeholder="e.g. Juan"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                  />
                  <FieldError message={liveError(profileErrors, 'givenName', givenName)} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Surname <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    onBlur={() => touch('surname')}
                    aria-invalid={!!liveError(profileErrors, 'surname', surname)}
                    placeholder="e.g. Dela Cruz"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                  />
                  <FieldError message={liveError(profileErrors, 'surname', surname)} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Email address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => isEmailEditable && setEmail(e.target.value)}
                    onBlur={() => touch('email')}
                    disabled={!isEmailEditable}
                    aria-invalid={!!liveError(profileErrors, 'email', email)}
                    placeholder="name@bicol-u.edu.ph"
                    title={isEmailEditable ? undefined : 'Regular staff cannot change their email address (REQ-EMP_PROF-01)'}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {isRegularStaff ? (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Locked — regular staff cannot change their email (REQ-EMP_PROF-01).
                    </p>
                  ) : (
                    <FieldError message={liveError(profileErrors, 'email', email)} />
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Phone number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => touch('phone')}
                    aria-invalid={!!liveError(profileErrors, 'phone', phone)}
                    placeholder="+63 912 345 6789"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                  />
                  <FieldError message={liveError(profileErrors, 'phone', phone)} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Employee category
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={CATEGORY_LABEL[category] || category}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Pronoun
                  </label>
                  <select
                    value={pronoun}
                    onChange={(e) => setPronoun(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all cursor-pointer"
                  >
                    {PRONOUNS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-9 px-4 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-9 px-4 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save profile'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Password</p>
                  <p className="text-[11px] text-slate-400">Last changed keeps your account secure.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Change password
                </button>
              </div>

              {/* FLOW-EMP_SET-03 - backup contacts for account recovery */}
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Backup contacts</p>
                  <p className="text-[11px] text-slate-400">
                    Used to reach you if you lose access to your account.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Backup phone number
                    </label>
                    <input
                      type="tel"
                      value={backupPhone}
                      onChange={(e) => setBackupPhone(e.target.value)}
                      onBlur={() => touch('backupPhone')}
                      aria-invalid={!!liveError(backupErrors, 'backupPhone', backupPhone)}
                      placeholder="+63 912 345 6789"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange"
                    />
                    <FieldError message={liveError(backupErrors, 'backupPhone', backupPhone)} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Backup email address
                    </label>
                    <input
                      type="email"
                      value={backupEmail}
                      onChange={(e) => setBackupEmail(e.target.value)}
                      onBlur={() => touch('backupEmail')}
                      aria-invalid={!!liveError(backupErrors, 'backupEmail', backupEmail)}
                      placeholder="backup@bicol-u.edu.ph"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange"
                    />
                    <FieldError message={liveError(backupErrors, 'backupEmail', backupEmail)} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveBackup}
                    disabled={isSavingBackup}
                    className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isSavingBackup ? 'Saving…' : 'Save backup contacts'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Sign-out shortcut - FLOW-EMP_LOGOUT-01/02: the confirmation
            dialog comes before the session is terminated. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
          >
            Sign out of the admin portal
          </button>
        </div>

        {confirmLogout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-100 p-5 shadow-2xl animate-scale-in">
              <h2 className="text-sm font-bold text-slate-900">Sign out of the admin portal?</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your session ends immediately on all devices.
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setConfirmLogout(false)}
                  className="h-8 px-3 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmLogout(false)
                    logoutAdmin()
                  }}
                  className="h-8 px-3 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Email OTP that gates the sensitive changes above (REQ-CUST_SET-02,
          admin-side channel = the employee's Bicol University mailbox). */}
      <OtpVerifyModal
        isOpen={otpOpen}
        purpose={otpPurpose}
        title="Verify it is you"
        onClose={() => {
          setOtpOpen(false)
          setPendingAction(null)
        }}
        onVerified={handleOtpVerified}
      />

      {/* Password change modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-100 p-5 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Change password</h2>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="pt-4 space-y-3">
              {passwordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                  {passwordError}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Current password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onBlur={() => touch('currentPassword')}
                  aria-invalid={!!liveError(passwordErrors, 'currentPassword', currentPassword)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange"
                />
                <FieldError message={liveError(passwordErrors, 'currentPassword', currentPassword)} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  New password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onBlur={() => touch('newPassword')}
                  aria-invalid={!!liveError(passwordErrors, 'newPassword', newPassword)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange"
                />
                <FieldError message={liveError(passwordErrors, 'newPassword', newPassword)} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Confirm new password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => touch('confirmPassword')}
                  aria-invalid={!!liveError(passwordErrors, 'confirmPassword', confirmPassword)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange"
                />
                <FieldError message={liveError(passwordErrors, 'confirmPassword', confirmPassword)} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="h-8 px-3 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="h-8 px-3 rounded-md bg-[#F97316] text-white text-xs font-semibold hover:bg-[#EA580C] cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPassword ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Wrapper>
  )
}
