import { Component } from 'react'
import { activePortal } from '../../services/api.js'
import Button from './Button.jsx'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

/**
 * Explicit failure text for any API call. Rendered instead of leaving the user
 * staring at a frozen screen, and deliberately a plain string so the real
 * server message is never swallowed.
 */
export function ApiErrorText({ error, fallback = 'Something went wrong. Please try again.', className = '' }) {
  if (!error) return null
  const message = error.message || error.payload?.message || fallback
  return (
    <div
      role="alert"
      className={`p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 ${className}`}
    >
      {message}
    </div>
  )
}

/**
 * The way out of a crashed screen, decided by the portal that is on screen
 * (services/api.js: activePortal) - rule 71 keeps the two portals separate, so
 * an employee who hits an error is NEVER sent to the storefront and a
 * customer is NEVER sent to the employee portal. Each side lands on its own
 * home: `/admin` resolves to that employee's role home (or the staff login),
 * `/home` is the storefront.
 */
function portalExit() {
  return activePortal() === 'staff'
    ? {
        homePath: '/admin',
        homeLabel: 'Back to my employee portal',
        // "Back" is offered first when it exists: it returns to the exact
        // screen they came from, inside this same portal.
        backLabel: 'Go back to the previous page',
      }
    : {
        homePath: '/home',
        homeLabel: 'Back to the storefront',
        backLabel: 'Go back to the previous page',
      }
}

/**
 * Last-resort boundary: a failed render (or a thrown API call that was never
 * caught) shows readable text plus a way back INTO THE USER'S OWN PORTAL
 * instead of a blank page or a cross-portal redirect.
 */
export class ApiErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Unhandled UI error:', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const exit = portalExit()
    // A real "back" only exists when this tab has somewhere to return to;
    // otherwise the portal home is the only offered way out.
    const canGoBack = typeof window !== 'undefined' && window.history.length > 1

    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-lg border border-slate-200 p-6 text-center space-y-3">
          {/* Small brand tile (matches LoginPromptModal) so the failure screen
              still reads as part of the storefront. */}
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-orange-50 rounded-md border border-orange-100 flex items-center justify-center p-2">
              <img src={logo} alt="Tindahan ni Isko" className="w-8 h-8 object-contain" />
            </div>
          </div>
          <h1 className="text-base font-semibold text-slate-900">This page hit an error</h1>
          <p className="text-sm text-slate-600 break-words">
            Something unexpected went wrong while showing this page. Please try
            again in a moment.
          </p>
          <p className="text-xs text-slate-400">
            Nothing was lost - your session is still signed in. You can go back or
            return to your portal and try again.
          </p>
          {/* The portal home is the guaranteed way back: it always lands the
              user inside their own portal, whichever entry they take. */}
          <Button
            type="button"
            variant="primary"
            block
            onClick={() => {
              this.setState({ error: null })
              window.location.assign(exit.homePath)
            }}
          >
            {exit.homeLabel}
          </Button>
          {canGoBack && (
            <Button
              type="button"
              variant="secondary"
              block
              onClick={() => {
                this.setState({ error: null })
                window.history.back()
              }}
            >
              {exit.backLabel}
            </Button>
          )}
        </div>
      </div>
    )
  }
}
