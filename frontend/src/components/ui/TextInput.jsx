/**
 * A styled text input consistent with the design system.
 * Use this for all text inputs across both portals.
 */
export default function TextInput({ label, error, hint, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="field-label">{label}</label>}
      <input
        className={`field-input ${error ? 'field-input--error' : ''}`}
        {...props}
      />
      {error && <p className="field-error">{error}</p>}
      {!error && hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
