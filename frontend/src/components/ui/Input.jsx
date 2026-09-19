function Input({ label, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      )}
      <input
        className={`w-full h-8 px-3 border rounded-md text-xs placeholder-gray-400 focus:outline-none focus:border-brand-orange transition-all ${
          error ? 'border-red-400 focus:border-red-500' : 'border-slate-200'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-red-500 text-[11px] mt-1 font-semibold">{error}</p>}
    </div>
  )
}

export default Input
