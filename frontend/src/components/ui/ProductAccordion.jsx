import { useState } from 'react'

export default function ProductAccordion({ details = {}, preOrder = false }) {
  const [openSections, setOpenSections] = useState({
    material: true,
    sizeFit: false,
    care: false,
    shippingReturns: false,
  })

  const toggleSection = (key) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const sections = [
    {
      key: 'material',
      title: 'Material & Fabric',
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
        </svg>
      ),
      content: details.material || 'Premium heavyweight campus merchandise crafted for comfort and longevity.',
    },
    {
      key: 'sizeFit',
      title: 'Size & Fit',
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      ),
      content: details.sizeFit || 'Standard unisex sizing. Refer to the size guide beside the selector for precise chest and length measurements.',
    },
    {
      key: 'care',
      title: 'Care Instructions',
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      content: details.care || 'Wash cold inside out with similar colors. Avoid harsh bleach. Air dry or low tumble dry.',
    },
    {
      key: 'shippingReturns',
      title: 'Shipping & Returns',
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
      content:
        details.shippingReturns ||
        (preOrder
          ? 'Free store pickup at BU Student Center once batch production finishes. Courier delivery options available at checkout with real-time SMS updates. 7-day replacement guaranteed for defective or incorrect items.'
          : 'Free store pickup at BU Student Center (Mon-Fri 9AM-4PM). Albay delivery in 1-2 days; Nationwide delivery in 3-5 days. 7-day return/exchange window.'),
    },
  ]

  return (
    <div className="border border-gray-200 rounded-3xl divide-y divide-gray-100 bg-white overflow-hidden shadow-2xs">
      <div className="px-5 py-3.5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Product Details</h3>
        <span className="text-[11px] text-gray-400 font-medium">Fabric & Care Specs</span>
      </div>

      {sections.map(({ key, title, icon, content }) => {
        const isOpen = openSections[key]
        return (
          <div key={key} className="transition-colors">
            <button
              type="button"
              onClick={() => toggleSection(key)}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50/70 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                  {icon}
                </span>
                <span className="text-sm font-bold text-gray-800">{title}</span>
              </div>
              <svg
                viewBox="0 0 24 24"
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-orange' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isOpen && (
              <div className="px-5 pb-4 pt-1 text-xs md:text-sm text-gray-600 leading-relaxed pl-14 animate-fade-in">
                {content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
