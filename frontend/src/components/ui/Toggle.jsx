/**
 * The system's one toggle switch.
 *
 * Every switch in the customer portal and the admin portal renders through this
 * component, which reads the shared `.switch` primitives from index.css: one
 * track size, one thumb size, one travel, one colour and one focus ring. The
 * `md`/`lg` sizes keep a dense list row and a roomy settings row readable
 * without ever making the switch look like a different control.
 */
function Toggle({ checked, onChange, label, description, disabled = false, size = 'md', className = '' }) {
  return (
    <div className={`switch-row ${className}`}>
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && <p className="switch-row__label">{label}</p>}
          {description && <p className="switch-row__hint">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || 'Toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`switch ${size === 'lg' ? 'switch--lg' : ''}`}
      />
    </div>
  )
}

export default Toggle
