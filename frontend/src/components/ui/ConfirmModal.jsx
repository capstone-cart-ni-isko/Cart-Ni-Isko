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

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-[99999] backdrop-blur-md transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />
      {/* Centered Modal Card */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-sm bg-white rounded-lg p-4 border border-slate-200 z-[10000] flex flex-col justify-between animate-scale-in">
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight">
            {title}
          </h3>
          <p className="text-xs text-gray-600 font-medium leading-relaxed mb-4">
            {message}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1 h-8 text-xs font-semibold rounded-md"
          >
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`flex-1 h-8 text-xs font-semibold rounded-md text-white ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                : 'bg-brand-orange hover:bg-brand-orange-dark'
            }`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </>
  )
}

export default ConfirmModal
