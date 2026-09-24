import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './Button.jsx'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

/**
 * Sign-in prompt for guests. On narrow screens a popup is awkward, so it
 * forwards straight to the sign-in screen instead; wider screens keep the
 * modal. Closing (or the redirect itself) never clears history, so the
 * back button returns to the last page.
 */
function LoginPromptModal({ isOpen, onClose, message = 'You need to sign in to access this feature.' }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isOpen) return undefined
    if (window.matchMedia('(max-width: 767px)').matches) {
      // Close first so the parent unmounts the prompt, then push /signin.
      onClose()
      navigate('/signin')
    }
    return undefined
  }, [isOpen, navigate, onClose])

  if (!isOpen) return null

  // `replace` lets callers opt out of a history entry (deep-link guard).
  const goSignIn = (replace = false) => {
    onClose()
    navigate('/signin', { replace })
  }

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 pb-24 md:pb-4 isolate">
      <div
        className="absolute inset-0 z-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-lg p-5 border border-gray-200 flex flex-col items-center text-center animate-scale-in">
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
          <Button onClick={() => goSignIn()} className="w-full h-8 text-xs font-semibold rounded-md">
            Log In
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              navigate('/signup')
            }}
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
    </div>,
    document.body
  )
}

export default LoginPromptModal
