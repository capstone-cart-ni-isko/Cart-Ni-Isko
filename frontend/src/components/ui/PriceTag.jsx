export function formatPrice(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function PriceTag({ amount, className = '' }) {
  return (
    <span className={`font-bold text-brand-orange ${className}`}>
      {formatPrice(amount)}
    </span>
  )
}

export default PriceTag
