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
      className={`flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-full px-2 py-1 w-max ${
        disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''
      } ${className}`}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm hover:bg-gray-50 active:scale-90 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        title="Decrease quantity"
        aria-label="Decrease quantity"
      >
        <img src={minusIcon} alt="Decrease" className="w-2.5 h-2.5" />
      </button>
      <span className="text-sm font-bold text-gray-800 w-6 text-center select-none">
        {disabled ? 0 : value}
      </span>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm hover:bg-gray-50 active:scale-90 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        title="Increase quantity"
        aria-label="Increase quantity"
      >
        <img src={plusIcon} alt="Increase" className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

export default QuantityStepper
