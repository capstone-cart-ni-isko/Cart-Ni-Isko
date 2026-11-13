function QuantityStepper({ value, onChange, min = 1, max = 99, disabled = false, className = '' }) {
  const handleDecrement = () => {
    if (!disabled && value > min) {
      onChange(value - 1)
    }
  }

  const handleIncrement = () => {
    if (!disabled && value < max) {
      onChange(value + 1)
    }
  }

  return (
    <div
      className={`stepper ${disabled ? 'opacity-60' : ''} ${className}`}
      aria-disabled={disabled || undefined}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className="stepper__btn"
        title="Decrease quantity"
        aria-label="Decrease quantity"
      >
        {/* currentColor: readable in light and dark themes */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <span className="stepper__value">{value}</span>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className="stepper__btn"
        title="Increase quantity"
        aria-label="Increase quantity"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  )
}

export default QuantityStepper
