import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * The single popup shell of the whole system.
 *
 * Both portals render their popup forms and confirmation dialogs through this
 * component, so the scrim, the panel, its corner, its padding, its heading and
 * its footer row are decided in ONE place (see "shared component primitives" in
 * index.css). A customer dialog and an admin dialog therefore look and behave
 * the same, on the phone, on the PWA and on the desktop.
 *
 * Layout rules honoured here (system rules 66–70, DOMAIN 16):
 *   · Escape closes, the backdrop closes, the close button sits at the TOP
 *     RIGHT of the panel (rule 70) — never the top left, which is where the
 *     "back" affordance belongs (rule 69).
 *   · The footer keeps Cancel/Confirm right-aligned in that order, so a
 *     confirm is never the first thing tapped by mistake.
 *
 * Props beyond the shell are passed straight through as `children` (the popup
 * FORM) and `footer` (its actions), so a caller can keep whatever internal
 * state and validation it already had.
 */
export default function Modal({
  isOpen,
  onClose,
  title = '',
  subtitle = '',
  children,
  footer = null,
  size = 'sm', // 'sm' → max-w-sm, 'wide' → wider forms
  sheet = false, // rise from the bottom on a phone (large pickers)
  closeOnBackdrop = true,
  className = '',
  bodyClassName = '',
}) {
  /* Escape is the keyboard's "exit" button - it is always wired while the
     popup is open, and only while it is, so stacked popups cannot all close
     from a single keypress. */
  useEffect(() => {
    if (!isOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && closeOnBackdrop) onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose, closeOnBackdrop])

  /* Accessibility: opening a popup moves focus INTO it (rule 70 puts that
     first stop on the top-right close button) so keyboard and screen-reader
     users land inside the dialog, and closing returns focus to whatever
     opened it instead of dropping it back on <body>. */
  const closeRef = useRef(null)
  useEffect(() => {
    if (!isOpen) return undefined
    const restoreTarget = document.activeElement
    // Give the portal a beat to mount before focusing the close control.
    const raf = window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(raf)
      if (restoreTarget && typeof restoreTarget.focus === 'function') {
        restoreTarget.focus()
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className={`modal-overlay${sheet ? ' modal-overlay--sheet' : ''}`}>
      {/* Scrim: a click outside the panel dismisses the popup. */}
      {closeOnBackdrop && (
        <div
          className="absolute inset-0"
          onClick={() => onClose?.()}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        className={`modal-panel${size === 'wide' ? ' modal-panel--wide' : ''}${
          sheet ? ' modal-panel--sheet' : ''
        } ${className}`}
      >
        {(title || subtitle) && (
          <div className="modal-head">
            <div className="min-w-0">
              {title && <h2 className="modal-title">{title}</h2>}
              {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>
            {closeOnBackdrop && (
              <button
                type="button"
                ref={closeRef}
                onClick={() => onClose?.()}
                className="modal-close"
                aria-label="Close"
                title="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className={`min-w-0 ${bodyClassName}`}>{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
