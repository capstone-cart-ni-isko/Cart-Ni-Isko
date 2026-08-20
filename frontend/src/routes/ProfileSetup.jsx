import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import AppShell from '../components/layout/AppShell.jsx'
import Button from '../components/ui/Button.jsx'
import backIcon from '../assets/icons/common/back.svg'

const steps = ['education', 'bio', 'success']

const yearLevels = ['1st Year Student', '2nd Year Student', '3rd Year Student', '4th Year Student', '5th Year Student']
const campuses = ['Main Campus', 'Daraga Campus', 'East Campus', 'Polangui Campus', 'Tabaco Campus']
const colleges = [
  'College of Engineering',
  'College of Science',
  'College of Arts and Letters',
  'College of Business, Economics and Management',
  'College of Education'
]
const courses = [
  'Mechanical Engineering',
  'Civil Engineering',
  'Electrical Engineering',
  'Chemical Engineering',
  'Computer Engineering',
  'Computer Science',
  'Information Technology'
]

function ProfileSetup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    yearLevel: '1st Year Student',
    campus: 'Main Campus',
    college: 'College of Engineering',
    course: 'Mechanical Engineering',
    bio: '',
    photo: null
  })

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function nextStep() {
    if (step < steps.length - 1) {
      setStep((s) => s + 1)
    } else {
      navigate('/home')
    }
  }

  function prevStep() {
    if (step > 0) {
      setStep((s) => s - 1)
    } else {
      navigate('/verify-otp')
    }
  }

  return (
    <AppShell showNav={false}>
      <div className="px-6 py-6 flex flex-col min-h-dvh justify-between animate-fade-in">
        <div>
          {/* Header row with back button */}
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={prevStep}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-gray hover:bg-gray-200 transition-colors"
            >
              <img src={backIcon} alt="Back" className="w-5 h-5" />
            </button>
            <div className="flex gap-2 w-32">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    i <= step ? 'bg-brand-orange' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>

          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Profile Setup</h1>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                  Tell us about yourself. This helps us personalize your experience.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Select Year Level</label>
                  <select
                    name="yearLevel"
                    value={form.yearLevel}
                    onChange={handleChange}
                    className="w-full h-12 px-4 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`, backgroundPosition: 'right 16px center', backgroundRepeat: 'no-repeat', backgroundSize: '18px' }}
                  >
                    {yearLevels.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Select Campus</label>
                  <select
                    name="campus"
                    value={form.campus}
                    onChange={handleChange}
                    className="w-full h-12 px-4 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`, backgroundPosition: 'right 16px center', backgroundRepeat: 'no-repeat', backgroundSize: '18px' }}
                  >
                    {campuses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Select College</label>
                  <select
                    name="college"
                    value={form.college}
                    onChange={handleChange}
                    className="w-full h-12 px-4 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`, backgroundPosition: 'right 16px center', backgroundRepeat: 'no-repeat', backgroundSize: '18px' }}
                  >
                    {colleges.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Select Course</label>
                  <select
                    name="course"
                    value={form.course}
                    onChange={handleChange}
                    className="w-full h-12 px-4 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`, backgroundPosition: 'right 16px center', backgroundRepeat: 'no-repeat', backgroundSize: '18px' }}
                  >
                    {courses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Tell us about yourself</h1>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                  Add a photo and a short bio to complete your profile.
                </p>
              </div>

              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-surface-gray border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-brand-orange hover:text-brand-orange transition-all">
                    <span className="text-2xl">+</span>
                    <span className="text-xs font-semibold">Photo</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Bio</label>
                <textarea
                  name="bio"
                  rows={4}
                  placeholder="Write a short bio..."
                  value={form.bio}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all resize-none"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center justify-center text-center py-8">
              <div className="w-32 h-32 mb-6 bg-brand-orange/5 rounded-full flex items-center justify-center p-4 shadow-inner">
                <img src={logo} alt="Tindahan ni Isko" className="w-24 drop-shadow-md animate-bounce" />
              </div>
              <h1 className="text-3xl font-extrabold text-gray-900 mb-2">All Set!</h1>
              <p className="text-sm text-gray-500 font-medium max-w-xs leading-relaxed">
                Your profile is ready. Start browsing and supporting the Iskolar ng Bayan.
              </p>
            </div>
          )}
        </div>

        <div className="pt-8">
          <Button onClick={nextStep} className="w-full h-12 shadow-md hover:shadow-lg active:scale-98">
            {step === 2 ? 'Start Browsing' : 'Continue'}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

export default ProfileSetup

