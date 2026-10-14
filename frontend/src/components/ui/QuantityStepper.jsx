import minusIcon from '../../assets/icons/common/minus.svg'
import plusIcon from '../../assets/icons/common/plus.svg'

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
        <img src={minusIcon} alt="" className="w-2.5 h-2.5" />
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
        <img src={plusIcon} alt="" className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

export default QuantityStepper
