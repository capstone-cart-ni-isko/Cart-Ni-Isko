import { useState, useEffect } from 'react'
import AuthLayout from '../components/layout/AuthLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import { mockUser } from '../data/mockUser.js'
import collegesData from '../data/colleges.json'
import avatarImg from '../assets/avatar.png'

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
  backgroundPosition: 'right 16px center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '18px'
}

const yearLevels = ['1st Year Student', '2nd Year Student', '3rd Year Student', '4th Year Student', '5th Year Student', 'Faculty / Staff', 'Alumni']

function AccountInfo() {
  const [form, setForm] = useState({
    firstName: mockUser.firstName,
    lastName: mockUser.lastName,
    username: mockUser.username,
    email: mockUser.email,
    phone: mockUser.phone,
    yearLevel: mockUser.yearLevel || '1st Year Student',
    campus: mockUser.campus || 'Main Campus',
    college: mockUser.college || 'College of Engineering',
    course: mockUser.course || 'Computer Engineering',
  })
  const [saved, setSaved] = useState(false)
  const [availableColleges, setAvailableColleges] = useState([])
  const [availableDepartments, setAvailableDepartments] = useState([])

  // Sync colleges when campus changes
  useEffect(() => {
    if (form.campus) {
      const campusObj = collegesData.find((c) => c.name === form.campus)
      setAvailableColleges(campusObj ? campusObj.colleges : [])
    } else {
      setAvailableColleges([])
    }
  }, [form.campus])

  // Sync departments when college changes
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
    setSaved(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <AuthLayout panelTitle="Your account." panelSubtitle="Keep your details up to date so we can serve you better.">
      <PageHeader title="Account Info" backTo="/profile" />
      <form onSubmit={handleSubmit} className="px-6 py-6 pb-12 lg:py-8 space-y-6 animate-fade-in">
        <div className="flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-brand-orange/20 shadow-md">
              <img src={avatarImg} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <button
              type="button"
              className="absolute bottom-0 right-0 bg-brand-orange hover:bg-brand-orange-dark text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md active:scale-95 transition-all"
            >
              EDIT
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" name="firstName" value={form.firstName} onChange={handleChange} />
            <Input label="Last Name" name="lastName" value={form.lastName} onChange={handleChange} />
          </div>
          <Input label="Username" name="username" value={form.username} onChange={handleChange} />
          <Input label="Email" name="email" type="email" value={form.email} onChange={handleChange} />
          <Input label="Phone" name="phone" type="tel" value={form.phone} onChange={handleChange} />

          {/* Year Level Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Year Level</label>
            <select
              name="yearLevel"
              value={form.yearLevel}
              onChange={handleChange}
              className="w-full h-11 px-3.5 border border-gray-250 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer transition-all appearance-none"
              style={selectStyle}
            >
              {yearLevels.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Campus Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Campus</label>
            <select
              name="campus"
              value={form.campus}
              onChange={handleChange}
              className="w-full h-11 px-3.5 border border-gray-250 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer transition-all appearance-none"
              style={selectStyle}
            >
              <option value="">Select Campus</option>
              {collegesData.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* College Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">College</label>
            <select
              name="college"
              value={form.college}
              onChange={handleChange}
              disabled={!form.campus}
              className="w-full h-11 px-3.5 border border-gray-250 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer disabled:opacity-50 transition-all appearance-none"
              style={selectStyle}
            >
              <option value="">Select College</option>
              {availableColleges.map((col) => (
                <option key={col.id} value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>

          {/* Department / Course Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Department / Course</label>
            <select
              name="course"
              value={form.course}
              onChange={handleChange}
              disabled={!form.college}
              className="w-full h-11 px-3.5 border border-gray-250 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer disabled:opacity-50 transition-all appearance-none"
              style={selectStyle}
            >
              <option value="">Select Department / Course</option>
              {availableDepartments.map((dept, i) => (
                <option key={i} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        <Button type="submit" className="w-full h-12 shadow-md">
          {saved ? 'Changes Saved!' : 'Save Changes'}
        </Button>
      </form>
    </AuthLayout>
  )
}

export default AccountInfo
