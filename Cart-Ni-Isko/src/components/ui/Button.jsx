function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-brand-orange hover:bg-brand-orange-dark text-white',
    secondary: 'border border-gray-300 text-gray-800 hover:bg-gray-50',
    ghost: 'text-gray-700 hover:bg-gray-100',
    pill: 'bg-brand-orange hover:bg-brand-orange-dark text-white rounded-full text-sm px-4 py-1.5',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export default Button
