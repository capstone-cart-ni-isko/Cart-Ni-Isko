import { createPortal } from 'react-dom'
import Button from './Button.jsx'

function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = true,
}) {
  if (!isOpen) return null

  return createPortal(

    <div className="fixed inset-0 z-[120000] flex items-center justify-center p-4 isolate">

      <div
        className="absolute inset-0 z-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel: always on top, always clickable */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm bg-white rounded-lg p-5 border border-gray-200 flex flex-col justify-between animate-scale-in pointer-events-auto"
      >
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight">
            {title}
          </h3>
          <p className="text-sm text-gray-600 font-medium leading-relaxed mb-4">
            {message}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1 h-9 text-sm font-semibold rounded-md"
          >
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`flex-1 h-9 text-sm font-semibold rounded-md text-white ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                : 'bg-brand-orange hover:bg-brand-orange-dark'
            }`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmModal