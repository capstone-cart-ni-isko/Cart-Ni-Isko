import { useNavigate } from 'react-router-dom'
import Button from './Button.jsx'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

function LoginPromptModal({ isOpen, onClose, message = 'You need to sign in to access this feature.' }) {
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleSignIn = () => {
    onClose()
    navigate('/signin')
  }

  const handleSignUp = () => {
    onClose()
    navigate('/signup')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[99999] backdrop-blur-md transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />
      {/* Modal Container */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-sm bg-white rounded-lg p-4 border border-slate-200 z-[10000] flex flex-col items-center text-center animate-scale-in">
        <div className="w-12 h-12 bg-orange-50 rounded-md border border-orange-100 flex items-center justify-center p-2 mb-3">
          <img src={logo} alt="Tindahan ni Isko" className="w-8 h-8 object-contain" />
        </div>

        <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight">
          Sign in required
        </h3>
        <p className="text-xs text-gray-600 font-normal leading-relaxed mb-4 px-2">
          {message}
        </p>

        <div className="w-full space-y-2">
          <Button onClick={handleSignIn} className="w-full h-8 text-xs font-semibold rounded-md">
            Log In
          </Button>
          <Button
            variant="secondary"
            onClick={handleSignUp}
            className="w-full h-8 text-xs font-semibold rounded-md border border-slate-200"
          >
            Create an Account
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700 font-semibold transition-colors pt-1 block mx-auto cursor-pointer"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </>
  )
}

export default LoginPromptModal
