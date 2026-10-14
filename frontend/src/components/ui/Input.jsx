function Input({ label, error, hint, id, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        className={`field-input ${error ? 'field-input--error' : ''} ${className}`}
        {...props}
      />
      {error && <p className="field-error">{error}</p>}
      {!error && hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export default Input
