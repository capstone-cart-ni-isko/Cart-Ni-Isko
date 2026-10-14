/**
 * A styled select dropdown consistent with the design system.
 * Use this for all select inputs across both portals.
 */
export default function SelectInput({ value, onChange, options, placeholder = 'Select…', className = '', label, error }) {
  return (
    <div className={className}>
      {label && <label className="field-label">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`field-input appearance-none pr-10 ${error ? 'field-input--error' : ''}`}
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
          backgroundPosition: 'right 12px center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '18px',
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
