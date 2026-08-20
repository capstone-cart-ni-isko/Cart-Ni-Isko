function Input({ label, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      )}
      <input
        className={`w-full h-12 px-4 border rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all ${
          error ? 'border-red-400 focus:ring-red-300' : 'border-gray-300'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1 font-semibold">{error}</p>}
    </div>
  )
}

export default Input
