/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback } from 'react'

export const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success', action = null) => {
    setToast({ message, type, action })
    const duration = action ? 4000 : 2500
    const timer = setTimeout(() => {
      setToast(null)
    }, duration)
    return () => clearTimeout(timer)
  }, [])

  const closeToast = useCallback(() => {
    setToast(null)
  }, [])

  return (
    <ToastContext.Provider value={{ toast, showToast, closeToast }}>
      {children}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] w-max max-w-sm px-4 animate-slide-up">
          <div
            className={`px-3.5 py-2 rounded-md text-xs font-medium flex items-center gap-2.5 border ${
              toast.type === 'error' ? 'bg-rose-50 text-rose-900 border-rose-200' : 'bg-white text-slate-800 border-slate-200'
            }`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action.onClick()
                  closeToast()
                }}
                className="px-2 py-0.5 rounded-md bg-brand-orange text-white font-bold text-xs hover:bg-brand-orange-dark active:scale-95 transition-transform cursor-pointer"
              >
                {toast.action.label || 'Undo'}
              </button>
            )}
            <button
              type="button"
              onClick={closeToast}
              className="ml-1 hover:opacity-80 active:scale-95 text-xs text-slate-400 hover:text-slate-600 font-bold p-0.5 cursor-pointer"
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
