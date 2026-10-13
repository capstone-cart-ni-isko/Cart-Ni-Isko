import Modal from './Modal.jsx'
import Button from './Button.jsx'

/**
 * The system's one confirmation dialog (DOMAIN 16, DOMAIN 30).
 *
 * The shell comes from Modal, so this dialog looks exactly like every other
 * popup in the customer and the admin portal; only the wording and the
 * destructive colour of the confirm button change per call.
 */
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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="px-3.5">
            {cancelText}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm?.()
              onClose?.()
            }}
            className="px-3.5 text-white"
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-[var(--muted)] font-medium leading-relaxed">{message}</p>
    </Modal>
  )
}

export default ConfirmModal
