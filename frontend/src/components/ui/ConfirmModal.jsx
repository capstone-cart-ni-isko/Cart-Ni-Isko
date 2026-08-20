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
        className="fixed inset-0 bg-black/40 z-[9999] backdrop-blur-[2px] transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />
      {/* Centered Modal Card */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-[10000] border border-gray-100 flex flex-col justify-between animate-scale-in">
        <div>
          <h3 className="text-lg font-black text-gray-900 mb-2 leading-tight">
            {title}
          </h3>
          <p className="text-sm text-gray-500 font-medium leading-relaxed mb-6">
            {message}
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1 h-11 text-sm font-bold rounded-xl"
          >
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`flex-1 h-11 text-sm font-bold rounded-xl text-white ${
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
