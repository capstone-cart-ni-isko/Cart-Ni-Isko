import React from 'react'

export default function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
  className = '',
}) {
  const isSm = size === 'sm'

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && <p className="text-sm font-semibold text-gray-900 truncate">{label}</p>}
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange && onChange(!checked)}
        className={`relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${
          isSm ? 'w-9 h-5' : 'w-11 h-6'
        } ${
          checked
            ? 'bg-brand-orange'
            : disabled
            ? 'bg-gray-200 opacity-60 cursor-not-allowed'
            : 'bg-gray-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
            isSm ? 'w-4 h-4 mt-0.5 ml-0.5' : 'w-5 h-5 mt-0.5 ml-0.5'
          } ${
            checked
              ? isSm
                ? 'translate-x-4'
                : 'translate-x-5'
              : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
