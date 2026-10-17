import Modal from '../ui/Modal.jsx'

/**
 * Standardized popup form shell for admin panels and drawers.
 * Uses the system-wide Modal popup standard (GUI elements, ISO 25010:2023,
 * rules 66-70) so that all panels, forms, and drawers across admin and
 * customer sides share a consistent layout, backdrop scrim, top-right exit
 * button, typography, and responsive behavior (desktop, mobile web, PWA).
 */
export default function DrawerPanel({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-md',
  footer = null,
}) {
  // Map legacy width props to Modal sizes
  let size = 'wide'
  if (width.includes('2xl') || width.includes('3xl') || width.includes('xl')) {
    size = 'xl'
  } else if (width.includes('lg')) {
    size = 'wide'
  } else if (width.includes('sm')) {
    size = 'sm'
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size={size}
      sheet={true}
      footer={footer}
    >
      <div className="modal-scroll space-y-4 pr-0.5">
        {children}
      </div>
    </Modal>
  )
}
