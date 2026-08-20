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
        className="fixed inset-0 bg-black/40 z-[9999] backdrop-blur-[2px] transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />
      {/* Modal Container */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-[10000] border border-gray-100 flex flex-col items-center text-center animate-scale-in">
        <div className="w-16 h-16 bg-brand-orange/10 rounded-full flex items-center justify-center p-2.5 mb-4">
          <img src={logo} alt="Tindahan ni Isko" className="w-10 h-10 object-contain" />
        </div>

        <h3 className="text-lg font-black text-gray-900 mb-2 leading-tight">
          Sign in required
        </h3>
        <p className="text-sm text-gray-500 font-semibold leading-relaxed mb-6 px-2">
          {message}
        </p>

        <div className="w-full space-y-2.5">
          <Button onClick={handleSignIn} className="w-full h-11 text-sm font-bold rounded-xl shadow-md">
            Log In
          </Button>
          <Button
            variant="secondary"
            onClick={handleSignUp}
            className="w-full h-11 text-sm font-bold rounded-xl border border-gray-200"
          >
            Create an Account
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 font-bold transition-colors pt-2 block mx-auto"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </>
  )
}

export default LoginPromptModal
