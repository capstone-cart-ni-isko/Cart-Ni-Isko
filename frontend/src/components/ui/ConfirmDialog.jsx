import Modal from './Modal.jsx'
import Button from './Button.jsx'

/**
 * A confirmation dialog for destructive or important actions.
 * Use this instead of window.confirm for a consistent experience.
 */
export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDestructive = false, loading = false }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={isDestructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing…' : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-[var(--muted)] font-medium leading-relaxed">
        {message}
      </p>
    </Modal>
  )
}
