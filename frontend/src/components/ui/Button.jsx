/**
 * The system's one button style.
 *
 * It reads the shared `btn` primitives from index.css (size, radius, weight,
 * focus ring) and only chooses its colour per variant, so a button is the same
 * height, weight and corner everywhere - customer portal, admin portal, phone,
 * PWA or desktop.
 */
function Button({
  children,
  variant = 'primary',
  size,
  block = false,
  loading = false,
  className = '',
  disabled = false,
  ...props
}) {
  const variants = {
    primary: 'btn--primary text-white',
    secondary: 'btn--secondary',
    outline: 'btn--secondary',
    ghost: 'btn--ghost',
    pill: 'btn--primary text-white',
    danger: 'btn--danger text-white',
  }

  const sizes = {
    sm: 'h-7 text-xs px-2.5',
    md: 'h-8 text-[13px] px-3',
    lg: 'btn--lg',
  }

  const classes = [
    'btn',
    variants[variant] || variants.primary,
    size ? sizes[size] : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} disabled={loading || disabled} {...props}>
      {loading && (
        <span
          className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
}

export default Button
