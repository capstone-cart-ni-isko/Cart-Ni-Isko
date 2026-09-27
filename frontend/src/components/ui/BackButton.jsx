import { useNavigate } from 'react-router-dom'
import { BackArrowIcon } from './Icons.jsx'

/**
 * Universal "Back" affordance for every step-by-step process (login, sign-up,
 * OTP, password recovery, profile setup).
 *
 * Pass `onClick` when the process has its own previous step, or `to` when the
 * previous view is a known route. With neither, it walks the history back.
 */
export default function BackButton({ to = null, onClick = null, label = 'Back', className = '' }) {
  const navigate = useNavigate()
  const goBack = () => {
    if (onClick) return onClick()
    if (to) return navigate(to)
    return navigate(-1)
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-brand-orange transition-colors cursor-pointer ${className}`}
    >
      <BackArrowIcon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  )
}
