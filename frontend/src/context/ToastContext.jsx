import { createContext, useState, useCallback } from 'react'

export const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(null)
    }, 2500)
  }, [])

  const closeToast = useCallback(() => {
    setToast(null)
  }, [])

  return (
    <ToastContext.Provider value={{ toast, showToast, closeToast }}>
      {children}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] w-max max-w-xs animate-slide-up">
          <div
            className={`px-4 py-2.5 rounded-full shadow-lg text-white font-semibold text-sm flex items-center gap-2 ${
              toast.type === 'error' ? 'bg-red-500' : 'bg-brand-orange'
            }`}
          >
            <span>{toast.type === 'error' ? '' : ''}</span>
            <span>{toast.message}</span>
            <button
              onClick={closeToast}
              className="ml-2 hover:opacity-80 active:scale-95 text-xs text-white/80 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
