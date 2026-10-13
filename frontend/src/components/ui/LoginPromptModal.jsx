import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal.jsx'
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sign in required"
      footer={
        <>
          <Button variant="primary" onClick={() => goSignIn()} className="flex-1">
            Log In
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              navigate('/signup')
            }}
            className="flex-1"
          >
            Create an Account
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 bg-orange-50 rounded-md border border-orange-100 flex items-center justify-center p-2">
          <img src={logo} alt="Tindahan ni Isko" className="w-8 h-8 object-contain" />
        </div>
        <p className="text-sm text-gray-600 font-normal leading-relaxed">
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-700 font-semibold transition-colors cursor-pointer"
        >
          Maybe Later
        </button>
      </div>
    </Modal>
  )
}

export default LoginPromptModal
