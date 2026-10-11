import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import collegesData from '../data/colleges.json'
import Avatar from '../components/ui/Avatar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { updateAccount } from '../services/accounts.js'
import { uploadImage } from '../services/upload.js'

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
  backgroundPosition: 'right 16px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '18px'
}

const yearLevels = ['1st Year Student', '2nd Year Student', '3rd Year Student', '4th Year Student', '5th Year Student', 'Faculty / Staff', 'Alumni']

/**
 * A stored value can legitimately be absent from the static list ('N/A',
 * combined '3rd Year - Block A', a campus not in colleges.json). Inject it so
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
  const [form, setForm] = useState({
    givname: currentUser?.cust_givname || currentUser?.givname || '',
    surname: currentUser?.cust_surname || currentUser?.surname || '',
    email: currentUser?.cust_email || currentUser?.email || '',
    phone: currentUser?.cust_phone || currentUser?.phone || '',
    yearLevel: currentUser?.cust_categ || currentUser?.yearLevel || 'N/A',
    campus: currentUser?.campus || 'N/A',
    college: currentUser?.cust_college || currentUser?.college || 'N/A',
    course: currentUser?.cust_dept || currentUser?.course || 'N/A',
    pronoun: currentUser?.cust_pronoun || currentUser?.pronoun || '',
    birthday: currentUser?.cust_bday || currentUser?.birthday || '',
    callcode: currentUser?.cust_callcode || currentUser?.callcode || '+63',
  })
  const [saveState, setSaveState] = useState('')
  const [availableColleges, setAvailableColleges] = useState([])
  const [availableDepartments, setAvailableDepartments] = useState([])
  const [photo, setPhoto] = useState(currentUser?.avatarImage || '')
  const fileInputRef = useRef(null)

  // Handle profile photo selection → real file upload to backend storage
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.type)) {
      setSaveState('Please upload a PNG, JPEG, GIF, or WebP image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setSaveState('Image size exceeds the 10MB limit.')
      return
    }
    setSaveState('Uploading photo…')
    try {
      const url = await uploadImage(file, 'avatar')
      setPhoto(url)
      setSaveState('Photo uploaded — click Save Changes to apply.')
    } catch (err) {
      setSaveState(err.message || 'Unable to upload photo.')
    }
  }

  useEffect(() => {
    if (form.campus) {
      const campusObj = collegesData.find((c) => c.name === form.campus)
      setAvailableColleges(campusObj ? campusObj.colleges : [])
    } else {
      setAvailableColleges([])
    }
  }, [form.campus])

  useEffect(() => {
    if (form.college && availableColleges.length > 0) {
      const collegeObj = availableColleges.find((col) => col.name === form.college)
      setAvailableDepartments(collegeObj ? collegeObj.programs : [])
    } else {
      setAvailableDepartments([])
    }
  }, [form.college, availableColleges])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => {
      const updated = { ...prev, [name]: value }
      if (name === 'campus') {
        updated.college = ''
        updated.course = ''
      } else if (name === 'college') {
        updated.course = ''
      }
      return updated
    })
    setSaveState('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const customerId = currentUser?.cust_id
    if (!customerId) {
      setSaveState('Unable to resolve your account.')
      return
    }

    setSaveState('Saving…')
    try {
      const response = await updateAccount('customer', customerId, {
        cust_givname: form.givname.trim(),
        cust_surname: form.surname.trim(),
        // REQ-CUST_PROF-01: the stored email is never changed by a profile
        // save, so it travels only to keep the read-only field round-tripping.
        cust_email: form.email,
        cust_phone: form.phone,
        cust_college: form.college,
        cust_dept: form.course,
        cust_categ: form.yearLevel !== 'N/A' ? form.yearLevel : null,
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
        phone: form.phone,
        cust_phone: form.phone,
        yearLevel: form.yearLevel,
        campus: form.campus,
        college: form.college,
        cust_college: form.college,
        course: form.course,
        cust_dept: form.course,
        pronoun: form.pronoun,
        cust_pronoun: form.pronoun,
        birthday: form.birthday,
        cust_bday: form.birthday,
        callcode: form.callcode,
        cust_callcode: form.callcode,
        avatarImage: photo,
      }))
      setSaveState('Changes saved!')
      showToast('Profile updated successfully')
    } catch (error) {
      setSaveState(error.message || 'Unable to save changes.')
      showToast(error.message || 'Unable to save changes.', 'error')
    }
  }

  const fullName = `${form.givname} ${form.surname}`.trim() || 'User'

  /* ── Realtime inline validation (values are checked as they are typed) ── */
  const fieldErrors = {
    givname: form.givname.trim() ? '' : 'First name is required.',
    surname: form.surname.trim() ? '' : 'Last name is required.',
    phone: /^[0-9]{10,11}$/.test(form.phone) ? '' : 'Enter a 10- or 11-digit phone number.',
    pronoun: form.pronoun.length > 50 ? 'Keep pronouns to 50 characters.' : '',
  }
  const hasErrors = Object.values(fieldErrors).some(Boolean)
  const fieldError = (name) =>
    fieldErrors[name] ? (
      <p className="mt-1 text-[11px] font-semibold text-red-500">{fieldErrors[name]}</p>
    ) : null

  /* ── Shared form field components ── */
  const inputClasses = 'w-full h-12 px-4 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all placeholder-gray-400'
  const labelClasses = 'block text-sm font-semibold text-gray-600 mb-1.5'
  const selectClasses = 'w-full h-12 px-4 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer transition-all appearance-none'

  return (
    <AccountLayout>
      {/* ── MOBILE LAYOUT ── */}
      <div className="md:hidden px-4 pb-28 animate-fade-in">
        <div className="-mx-4 -mt-0 mb-4">
          <PageHeader title="Edit Profile" backTo="/profile" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-brand-orange/20 shadow-md">
                <Avatar name={fullName} size={96} className="w-full h-full" userId={currentUser?.cust_id} src={photo} />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-brand-orange hover:bg-brand-orange-dark text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md active:scale-95 transition-all"
              >
                EDIT
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/gif" className="hidden" onChange={handlePhotoChange} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>First Name <span className="text-red-500">*</span></label>
                <input name="givname" required maxLength={100} value={form.givname} onChange={handleChange} className={inputClasses} />
                {fieldError('givname')}
              </div>
              <div>
                <label className={labelClasses}>Last Name <span className="text-red-500">*</span></label>
                <input name="surname" required maxLength={100} value={form.surname} onChange={handleChange} className={inputClasses} />
                {fieldError('surname')}
              </div>
            </div>
            <div>
              <label className={labelClasses}>Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                readOnly
                aria-readonly="true"
                className={`${inputClasses} bg-gray-50 text-gray-500 cursor-not-allowed`}
              />
              <p className="mt-1 text-[11px] font-medium text-gray-400">
                Your sign-in email cannot be changed here (REQ-CUST_PROF-01).
              </p>
            </div>
            <div>
              <label className={labelClasses}>Phone <span className="text-red-500">*</span></label>
              <input name="phone" type="tel" required value={form.phone} onChange={handleChange} className={inputClasses} />
              {fieldError('phone')}
            </div>

            {/* Year Level */}
            <div>
              <label className={labelClasses}>Year Level</label>
              <select name="yearLevel" value={form.yearLevel} onChange={handleChange} className={selectClasses} style={selectStyle}>
                {withValue(yearLevels, form.yearLevel).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {/* Campus */}
            <div>
              <label className={labelClasses}>Campus</label>
              <select name="campus" value={form.campus} onChange={handleChange} className={selectClasses} style={selectStyle}>
                <option value="">Select Campus</option>
                {withValue(collegesData.map((c) => c.name), form.campus).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            {/* College */}
            <div>
              <label className={labelClasses}>College</label>
              <select name="college" value={form.college} onChange={handleChange} disabled={!form.campus} className={`${selectClasses} disabled:opacity-50`} style={selectStyle}>
                <option value="">Select College</option>
                {withValue(availableColleges.map((col) => col.name), form.college).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            {/* Department / Course */}
            <div>
              <label className={labelClasses}>Department / Course</label>
              <select name="course" value={form.course} onChange={handleChange} disabled={!form.college} className={`${selectClasses} disabled:opacity-50`} style={selectStyle}>
                <option value="">Select Department / Course</option>
                {withValue(availableDepartments, form.course).map((dept) => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            </div>
          </div>

          {/* Additional Information Section */}
          <div className="space-y-5">
            <h2 className="text-base font-black text-gray-900">Additional Information</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>Pronoun</label>
                <input name="pronoun" value={form.pronoun} onChange={handleChange} className={inputClasses} />
              </div>
              <div>
                <label className={labelClasses}>Birthday</label>
                <input name="birthday" type="date" value={form.birthday} onChange={handleChange} className={inputClasses} />
              </div>
              <div>
                <label className={labelClasses}>Phone Code</label>
                <input name="callcode" value={form.callcode} onChange={handleChange} className={inputClasses} />
              </div>
              <div className="col-span-2">
                <label className={labelClasses}>Delivery Addresses</label>
                <Link
                  to="/settings/address"
                  className="flex items-center justify-between h-12 px-4 border border-dashed border-brand-orange/40 rounded-xl text-sm font-bold text-brand-orange bg-brand-orange/5 hover:bg-brand-orange/10 transition-colors"
                >
                  Manage your addresses
                  <span className="text-lg leading-none">›</span>
                </Link>
                <p className="mt-1 text-[11px] font-medium text-gray-400">
                  Addresses are managed under Settings → Addresses.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saveState === 'Saving…' || hasErrors}
            className="w-full h-12 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saveState || 'Save Changes'}
          </button>
        </form>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:block w-full space-y-5 py-1 animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to="/settings" className="text-gray-400 hover:text-gray-600 transition-colors">Account Settings</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-bold">Edit Profile</span>
        </div>

        {/* Page Title */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Edit Profile</h1>
            <p className="text-sm text-gray-400">Keep your personal information up to date.</p>
          </div>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100/90 shadow-xs overflow-hidden">
          {/* Profile Photo Section */}
          <div className="px-7 py-6 border-b border-gray-100 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-brand-orange/20 shadow-md shrink-0">
              <Avatar name={fullName} size={64} className="w-full h-full" userId={currentUser?.cust_id} src={photo} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{fullName}</h3>
              <p className="text-sm text-gray-400 truncate">{form.email}</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ml-auto flex items-center gap-2 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-sm active:scale-95 transition-all shrink-0"
            >
              <PencilIcon className="w-3.5 h-3.5" />
              <span>Edit Photo</span>
            </button>
          </div>

            {/* Personal Information Section */}
            <div className="px-7 py-6 border-b border-gray-100 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-gray-900">Personal Information</h2>
                <p className="text-xs text-gray-400"><span className="text-red-500">*</span> Fields marked with an asterisk are required.</p>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className={labelClasses}>First Name <span className="text-red-500">*</span></label>
                  <input name="givname" required maxLength={100} value={form.givname} onChange={handleChange} className={inputClasses} />
                  {fieldError('givname')}
                </div>
                <div>
                  <label className={labelClasses}>Last Name <span className="text-red-500">*</span></label>
                  <input name="surname" required maxLength={100} value={form.surname} onChange={handleChange} className={inputClasses} />
                  {fieldError('surname')}
                </div>
                <div>
                  <label className={labelClasses}>Email</label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    readOnly
                    aria-readonly="true"
                    className={`${inputClasses} bg-gray-50 text-gray-500 cursor-not-allowed`}
                  />
                  <p className="mt-1 text-[11px] font-medium text-gray-400">
                    Your sign-in email cannot be changed here (REQ-CUST_PROF-01).
                  </p>
                </div>
                <div>
                  <label className={labelClasses}>Phone <span className="text-red-500">*</span></label>
                  <input name="phone" type="tel" required value={form.phone} onChange={handleChange} className={inputClasses} />
                  {fieldError('phone')}
                </div>
              </div>
            </div>

            {/* Additional Information Section */}
            <div className="px-7 py-6 border-b border-gray-100 space-y-5">
              <h2 className="text-base font-black text-gray-900">Additional Information</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className={labelClasses}>Pronoun</label>
                  <input name="pronoun" value={form.pronoun} onChange={handleChange} className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Birthday</label>
                  <input name="birthday" type="date" value={form.birthday} onChange={handleChange} className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Phone Code</label>
                  <input name="callcode" value={form.callcode} onChange={handleChange} className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Delivery Addresses</label>
                  <Link
                    to="/settings/address"
                    className="flex items-center justify-between h-12 px-4 border border-dashed border-brand-orange/40 rounded-xl text-sm font-bold text-brand-orange bg-brand-orange/5 hover:bg-brand-orange/10 transition-colors"
                  >
                    Manage your addresses
                    <span className="text-lg leading-none">›</span>
                  </Link>
                </div>
              </div>
              <p className="text-[11px] font-medium text-gray-400">
                Delivery addresses and backup contacts are managed under Settings.
              </p>
            </div>

            {/* Academic Information Section */}
            <div className="px-7 py-6 border-b border-gray-100 space-y-5">
              <h2 className="text-base font-black text-gray-900">Academic Information</h2>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className={labelClasses}>Year Level <span className="text-red-500">*</span></label>
                  <select name="yearLevel" value={form.yearLevel} onChange={handleChange} className={selectClasses} style={selectStyle}>
                    {withValue(yearLevels, form.yearLevel).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Campus <span className="text-red-500">*</span></label>
                  <select name="campus" value={form.campus} onChange={handleChange} className={selectClasses} style={selectStyle}>
                    <option value="">Select Campus</option>
                    {withValue(collegesData.map((c) => c.name), form.campus).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>College <span className="text-red-500">*</span></label>
                  <select name="college" value={form.college} onChange={handleChange} disabled={!form.campus} className={`${selectClasses} disabled:opacity-50`} style={selectStyle}>
                    <option value="">Select College</option>
                    {withValue(availableColleges.map((col) => col.name), form.college).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Department / Course <span className="text-red-500">*</span></label>
                  <select name="course" value={form.course} onChange={handleChange} disabled={!form.college} className={`${selectClasses} disabled:opacity-50`} style={selectStyle}>
                    <option value="">Select Department / Course</option>
                    {withValue(availableDepartments, form.course).map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Action Buttons - Rectangular */}
            <div className="px-7 py-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="px-7 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveState === 'Saving…' || hasErrors}
                className="px-7 py-2.5 rounded-xl bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-sm shadow-sm active:scale-95 transition-all disabled:opacity-60"
              >
                {saveState || 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
    </AccountLayout>
  )
}

export default AccountInfo