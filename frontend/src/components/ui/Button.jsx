function Button({ children, variant = 'primary', className = '', loading, ...props }) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm h-8 px-3 gap-2'
  const variants = {
    primary: 'bg-brand-orange hover:bg-brand-orange-dark text-white',
    secondary: 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200',
    ghost: 'text-slate-700 hover:bg-slate-100',
    pill: 'bg-brand-orange hover:bg-brand-orange-dark text-white rounded-md',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

export default Button
