/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, useRef, useEffect } from 'react'

export const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  // Clear the pending dismissal whenever the toast changes or the provider
  // unmounts, so a second toast can never be closed by the first one's timer.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const showToast = useCallback((message, type = 'success', action = null) => {
    clearTimeout(timerRef.current)
    setToast({ message, type, action })
    const duration = action ? 4000 : 2500
    timerRef.current = setTimeout(() => {
      setToast(null)
    }, duration)
    return () => clearTimeout(timerRef.current)
  }, [])

  const closeToast = useCallback(() => {
    clearTimeout(timerRef.current)
    setToast(null)
  }, [])

  return (
    <ToastContext.Provider value={{ toast, showToast, closeToast }}>
      {children}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[140000] w-max max-w-sm px-4 animate-slide-up"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
          role="status"
          aria-live="polite"
        >
          <div className={`toast ${toast.type === 'error' ? 'toast--error' : 'toast--success'}`}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action.onClick()
                  closeToast()
                }}
                className="btn btn--primary ml-auto"
              >
                {toast.action.label || 'Undo'}
              </button>
            )}
            <button
              type="button"
              onClick={closeToast}
              className="modal-close"
              title="Close"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
