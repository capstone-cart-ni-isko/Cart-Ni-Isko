import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import collegesData from '../data/colleges.json'
import Avatar from '../components/ui/Avatar.jsx'
import Card from '../components/ui/Card.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { updateAccount } from '../services/accounts.js'
import { uploadImage } from '../services/upload.js'
import { isPhMobile, normalizePhMobile, PH_MOBILE_MESSAGE } from '../utils/phone.js'
import { IMAGE_ACCEPT, imageFileProblem } from '../utils/imageTypes.js'

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
  backgroundPosition: 'right 16px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '18px'
}

// BUeño accounts are Student or Faculty only (cust_categ). A legacy value
// (e.g. an old alumni account) still shows, but is never re-sent on save.
const BUENO_CATEGORIES = ['student', 'faculty']
const ALL_COLLEGES = collegesData.flatMap((campus) => campus.colleges || [])
const COLLEGE_NAMES = ALL_COLLEGES.map((col) => col.name)
const categoryLabel = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value)

/**
 * A stored value can legitimately be absent from the static list ('N/A',
 * combined '3rd Year - Block A', a college not in colleges.json). Inject it so
 * the select shows what is actually saved instead of silently resetting.
 */
function withValue(list, value) {
  return value && !list.includes(value) ? [value, ...list] : list
}

/* Inline SVG icons */
function PencilIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function AccountInfo() {
  const navigate = useNavigate()
  const { currentUser, setCurrentUser } = useAuth()
  const { showToast } = useToast()
  const isGuest = String(
    currentUser?.cust_type || currentUser?.type || currentUser?.role || ''
  ).trim().toLowerCase() === 'guest'
  const [form, setForm] = useState({
    givname: currentUser?.cust_givname || currentUser?.givname || '',
    surname: currentUser?.cust_surname || currentUser?.surname || '',
    email: currentUser?.cust_email || currentUser?.email || '',
    phone: currentUser?.cust_phone || currentUser?.phone || '',
    yearLevel: String(currentUser?.cust_categ || currentUser?.yearLevel || 'N/A').toLowerCase() === 'n/a' ? 'N/A' : String(currentUser?.cust_categ || currentUser?.yearLevel).toLowerCase(),
    college: currentUser?.cust_college || currentUser?.college || 'N/A',
    course: currentUser?.cust_dept || currentUser?.course || 'N/A',
    pronoun: currentUser?.cust_pronoun || currentUser?.pronoun || '',
    birthday: currentUser?.cust_bday || currentUser?.birthday || '',
    callcode: currentUser?.cust_callcode || currentUser?.callcode || '+63',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  // Messages live next to what they describe (rule 67), never on the button.
  const [photoNote, setPhotoNote] = useState(null) // { tone: 'info' | 'error', text }
  const [saveError, setSaveError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [photo, setPhoto] = useState(currentUser?.avatarImage || '')
  const fileInputRef = useRef(null)

  // Handle profile photo selection → real file upload to backend storage
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = imageFileProblem(file, 'Profile photos')
    if (problem) {
      setPhotoNote({ tone: 'error', text: problem })
      return
    }
    setIsUploading(true)
    setPhotoNote({ tone: 'info', text: 'Uploading photo…' })
    try {
      const url = await uploadImage(file, 'avatar')
      setPhoto(url)
      setPhotoNote({ tone: 'info', text: 'New photo ready. Save changes to apply it.' })
    } catch (err) {
      setPhotoNote({ tone: 'error', text: err.message || 'Unable to upload photo.' })
    } finally {
      setIsUploading(false)
    }
  }

  // Campus is not part of the profile, so every Bicol University college is
  // offered in one list (college names are unique across campuses), the same
  // flattened list sign-up uses.
  const departmentsOf = (collegeName) => {
    const found = ALL_COLLEGES.find((col) => col.name === collegeName)
    return found ? (found.departments || found.programs || []) : []
  }
  const availableDepartments = departmentsOf(form.college)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => {
      const updated = { ...prev, [name]: value }
      if (name === 'college') {
        updated.course = ''
      }
      return updated
    })
    setSaveError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors) return
    const customerId = currentUser?.cust_id
    if (!customerId) {
      setSaveError('Unable to resolve your account. Please sign in again.')
      return
    }

    setIsSaving(true)
    setSaveError('')
    try {
      const response = await updateAccount('customer', customerId, {
        cust_givname: form.givname.trim(),
        cust_surname: form.surname.trim(),
        // REQ-CUST_PROF-01: the stored email is never changed by a profile
        // save, so it travels only to keep the read-only field round-tripping.
        cust_email: form.email,
        cust_phone: normalizePhMobile(form.phone),
        ...(!isGuest ? {
          cust_college: form.college && form.college !== 'N/A' ? form.college : null,
          cust_dept: form.course && form.course !== 'N/A' ? form.course : null,
          ...(BUENO_CATEGORIES.includes(form.yearLevel) ? { cust_categ: form.yearLevel } : {}),
        } : {}),
        cust_pronoun: form.pronoun,
        cust_bday: form.birthday,
        cust_callcode: form.callcode,
        cust_avatar: photo,
      })
      // Re-sync the in-memory user with whatever the backend confirmed.
      setCurrentUser((user) => ({
        ...user,
        ...response.data,
        cust_givname: form.givname.trim(),
        cust_surname: form.surname.trim(),
        givname: form.givname.trim(),
        surname: form.surname.trim(),
        fullName: `${form.givname.trim()} ${form.surname.trim()}`.trim(),
        email: form.email,
        cust_email: form.email,
        phone: normalizePhMobile(form.phone),
        cust_phone: normalizePhMobile(form.phone),
        ...(!isGuest ? {
          yearLevel: form.yearLevel,
          college: form.college,
          cust_college: form.college,
          course: form.course,
          cust_dept: form.course,
        } : {}),
        pronoun: form.pronoun,
        cust_pronoun: form.pronoun,
        birthday: form.birthday,
        cust_bday: form.birthday,
        callcode: form.callcode,
        cust_callcode: form.callcode,
        avatarImage: photo,
        cust_photo: photo,
      }))
      // Update local session so avatar persists across reloads
      try {
        const session = JSON.parse(localStorage.getItem('isko_session') || 'null')
        if (session?.token) {
          localStorage.setItem('isko_session', JSON.stringify({
            ...session,
            user: {
              ...(session.user || {}),
              avatarImage: photo,
              cust_photo: photo,
              cust_givname: form.givname.trim(),
              cust_surname: form.surname.trim(),
              ...(!isGuest ? {
                yearLevel: form.yearLevel,
                college: form.college,
                course: form.course,
              } : {}),
            }
          }))
        }
      } catch { /* storage unavailable - the in-memory user is already updated */ }

      showToast('Profile updated successfully')
      navigate('/profile', { replace: true })
    } catch (error) {
      setSaveError(error.message || 'Unable to save changes.')
      showToast('Unable to save changes.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const fullName = `${form.givname} ${form.surname}`.trim() || 'User'

  /* ── Realtime inline validation (values are checked as they are typed) ── */
  const fieldErrors = {
    givname: form.givname.trim() ? '' : 'First name is required.',
    surname: form.surname.trim() ? '' : 'Last name is required.',
    phone: isPhMobile(form.phone) ? '' : PH_MOBILE_MESSAGE,
    pronoun: form.pronoun.length > 50 ? 'Keep pronouns to 50 characters.' : '',
    // Sign-up requires both for a BUeño account; the profile keeps that rule.
    college: !isGuest && (!form.college || form.college === 'N/A') ? 'Select your college.' : '',
    course: !isGuest && (!form.course || form.course === 'N/A') ? 'Select your department / course.' : '',
  }
  const hasErrors = Object.values(fieldErrors).some(Boolean)
  const quietUntilSubmit = ['college', 'course']
  const fieldError = (name) =>
    fieldErrors[name] && (submitted || !quietUntilSubmit.includes(name)) ? (
      <p className="field-error" role="alert">{fieldErrors[name]}</p>
    ) : null

  /* ── Shared field primitives (index.css: .field-label / .field-input) ── */
  const inputClasses = 'field-input field-input--lg'
  const labelClasses = 'field-label'
  const selectClasses = 'field-input field-input--lg pr-10 cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed'
  const required = <span className="text-red-500">*</span>
  const photoNoteLine = photoNote && (
    <p
      className={`mt-1 text-[11px] font-medium ${photoNote.tone === 'error' ? 'text-red-500' : 'text-slate-500'}`}
      role={photoNote.tone === 'error' ? 'alert' : undefined}
    >
      {photoNote.text}
    </p>
  )

  return (
    <FocusedLayout title="Edit Profile" subtitle="Keep your personal information up to date" backTo="/profile" containerClassName="max-w-4xl">
      {/* One responsive form for phone and desktop: the same fields in the
          same order, stacked on a phone and in two columns from md up. */}
      <form onSubmit={handleSubmit} noValidate className="w-full pb-16 md:pb-6 space-y-4 animate-fade-in">
        {/* Profile photo */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 md:w-18 md:h-18 rounded-full overflow-hidden border-2 border-brand-orange/20 shadow-2xs shrink-0">
              <Avatar name={fullName} size={72} className="w-full h-full" userId={currentUser?.cust_id} src={photo} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-slate-900 dark:text-[var(--ink)] truncate">{fullName}</p>
              <p className="text-sm text-slate-500 dark:text-[var(--muted)] truncate">{form.email}</p>
              {photoNoteLine}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="btn btn--secondary shrink-0"
            >
              <PencilIcon className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading…' : 'Edit Photo'}</span>
            </button>
            <input ref={fileInputRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={handlePhotoChange} />
          </div>
        </Card>

        {/* Personal information */}
        <Card
          title="Personal Information"
          action={<p className="text-[11px] text-slate-400">{required} Required</p>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label htmlFor="acct-givname" className={labelClasses}>First Name {required}</label>
              <input id="acct-givname" name="givname" required maxLength={100} value={form.givname} onChange={handleChange} aria-invalid={!!fieldErrors.givname} className={inputClasses} />
              {fieldError('givname')}
            </div>
            <div>
              <label htmlFor="acct-surname" className={labelClasses}>Last Name {required}</label>
              <input id="acct-surname" name="surname" required maxLength={100} value={form.surname} onChange={handleChange} aria-invalid={!!fieldErrors.surname} className={inputClasses} />
              {fieldError('surname')}
            </div>
            <div>
              <label htmlFor="acct-email" className={labelClasses}>Email</label>
              <input
                id="acct-email"
                name="email"
                type="email"
                value={form.email}
                readOnly
                aria-readonly="true"
                className={`${inputClasses} bg-slate-50 dark:bg-[var(--surface-2)] text-slate-500 cursor-not-allowed`}
              />
              <p className="field-hint">Your sign-in email cannot be changed.</p>
            </div>
            <div>
              <label htmlFor="acct-phone" className={labelClasses}>Phone {required}</label>
              <input id="acct-phone" name="phone" type="tel" inputMode="tel" required placeholder="09XX XXX XXXX" value={form.phone} onChange={handleChange} aria-invalid={!!fieldErrors.phone} className={inputClasses} />
              {fieldError('phone')}
            </div>
          </div>
        </Card>

        {/* Academic information (BUeño accounts) */}
        {!isGuest && (
          <Card title="Academic Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <label htmlFor="acct-category" className={labelClasses}>Category {required}</label>
                <select id="acct-category" name="yearLevel" value={form.yearLevel} onChange={handleChange} className={selectClasses} style={selectStyle}>
                  {withValue(BUENO_CATEGORIES, form.yearLevel).map((y) => <option key={y} value={y}>{categoryLabel(y)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="acct-college" className={labelClasses}>College {required}</label>
                <select id="acct-college" name="college" value={form.college} onChange={handleChange} className={selectClasses} style={selectStyle}>
                  <option value="">Select College</option>
                  {withValue(COLLEGE_NAMES, form.college).map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {fieldError('college')}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="acct-course" className={labelClasses}>Department / Course {required}</label>
                <select id="acct-course" name="course" value={form.course} onChange={handleChange} disabled={!form.college} className={selectClasses} style={selectStyle}>
                  <option value="">Select Department / Course</option>
                  {withValue(availableDepartments, form.course).map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                </select>
                {fieldError('course')}
              </div>
            </div>
          </Card>
        )}

        {/* Additional information */}
        <Card title="Additional Information">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label htmlFor="acct-pronoun" className={labelClasses}>Pronoun</label>
              <input id="acct-pronoun" name="pronoun" maxLength={50} placeholder="e.g. she/her" value={form.pronoun} onChange={handleChange} aria-invalid={!!fieldErrors.pronoun} className={inputClasses} />
              {fieldError('pronoun')}
            </div>
            <div>
              <label htmlFor="acct-birthday" className={labelClasses}>Birthday</label>
              <input id="acct-birthday" name="birthday" type="date" value={form.birthday} onChange={handleChange} className={inputClasses} />
            </div>
            <div className="sm:col-span-2">
              <span className={labelClasses}>Delivery Addresses</span>
              <Link
                to="/settings/address"
                className="flex items-center justify-between h-12 px-4 border border-dashed border-brand-orange/40 rounded-[var(--radius-sm)] text-sm font-semibold text-brand-orange bg-brand-orange/5 hover:bg-brand-orange/10 transition-colors"
              >
                Manage your addresses
                <span className="text-lg leading-none" aria-hidden="true">›</span>
              </Link>
              <p className="field-hint">Delivery addresses and backup contacts are managed under Settings.</p>
            </div>
          </div>
        </Card>

        {/* Actions: full-width and stacked on a phone, right-aligned from md */}
        {saveError && (
          <p className="text-xs font-semibold text-red-500 text-center md:text-right" role="alert">{saveError}</p>
        )}
        <div className="flex flex-col-reverse gap-2.5 md:flex-row md:items-center md:justify-end md:gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="btn btn--secondary btn--lg w-full md:w-auto md:px-6"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || isUploading}
            className="btn btn--primary btn--lg w-full md:w-auto md:px-6"
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </FocusedLayout>
  )
}

export default AccountInfo
