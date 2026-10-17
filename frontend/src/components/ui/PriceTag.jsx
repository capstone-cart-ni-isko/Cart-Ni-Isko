/* eslint-disable react-refresh/only-export-components */
export function formatPrice(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function PriceTag({ amount, className = '', tone = 'brand' }) {
  return (
    <span className={`${tone === 'neutral' ? 'font-semibold text-black' : 'font-semibold text-brand-orange'} ${className}`}>
      {formatPrice(amount)}
    </span>
  )
}

export default PriceTag
