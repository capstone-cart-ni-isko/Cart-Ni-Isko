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
            className={`px-4 py-2.5 rounded-full shadow-lg text-white font-semibold text-xs sm:text-sm flex items-center gap-2.5 border border-white/20 ${
              toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900/95 backdrop-blur-sm'
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
                className="px-2.5 py-1 rounded-full bg-brand-orange text-white font-black text-xs hover:bg-brand-orange-dark active:scale-95 transition-transform cursor-pointer shadow-xs"
              >
                {toast.action.label || 'Undo'}
              </button>
            )}
            <button
              type="button"
              onClick={closeToast}
              className="ml-1 hover:opacity-80 active:scale-95 text-xs text-white/70 font-bold p-1 cursor-pointer"
              title="Close"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
