import { Component } from 'react'

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
 * Last-resort boundary: a failed render (or a thrown API call that was never
 * caught) shows readable text plus a way out instead of a blank page.
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

    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-lg border border-slate-200 p-6 text-center space-y-3">
          <h1 className="text-base font-extrabold text-slate-900">This page hit an error</h1>
          <p className="text-sm text-slate-600 break-words">
            {error.message || 'An unexpected problem occurred.'}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null })
              window.location.assign('/home')
            }}
            className="w-full h-10 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-sm font-bold transition-colors cursor-pointer"
          >
            Back to Homepage
          </button>
        </div>
      </div>
    )
  }
}
