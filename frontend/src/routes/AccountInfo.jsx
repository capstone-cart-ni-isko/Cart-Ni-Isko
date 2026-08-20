import { useState } from 'react'
import AuthLayout from '../components/layout/AuthLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import { mockUser } from '../data/mockUser.js'
import avatarImg from '../assets/avatar.png'

function AccountInfo() {
  const [form, setForm] = useState({
    firstName: mockUser.firstName,
    lastName: mockUser.lastName,
    username: mockUser.username,
    email: mockUser.email,
    phone: mockUser.phone,
    yearLevel: mockUser.yearLevel,
    campus: mockUser.campus,
    college: mockUser.college,
    course: mockUser.course,
  })
  const [saved, setSaved] = useState(false)

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
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
          <Input label="Year Level" name="yearLevel" value={form.yearLevel} onChange={handleChange} />
          <Input label="Campus" name="campus" value={form.campus} onChange={handleChange} />
          <Input label="College" name="college" value={form.college} onChange={handleChange} />
          <Input label="Course" name="course" value={form.course} onChange={handleChange} />
        </div>

        <Button type="submit" className="w-full h-12 shadow-md">
          {saved ? 'Changes Saved!' : 'Save Changes'}
        </Button>
      </form>
    </AuthLayout>
  )
}

export default AccountInfo

