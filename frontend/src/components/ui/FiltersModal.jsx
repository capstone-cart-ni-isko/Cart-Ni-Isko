import { useState, useEffect } from 'react'
import Button from './Button.jsx'
import closeIcon from '../../assets/icons/common/close.svg'

const categories = ['All', 'Shirts', 'Hoodie', 'Cap', 'Lanyard', 'Stickers', 'Pins', 'Windbreaker', 'Varsity Jacket']
const collections = ['All', 'BUnique Collection', 'Classic BU', 'Essentials']
const sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL']
const colors = [
  { name: 'Orange', value: '#FF7A00' },
  { name: 'Blue', value: '#1887C7' },
  { name: 'Black', value: '#1F2937' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Grey', value: '#4B5563' },
  { name: 'Gold', value: '#F59E0B' },
]

function FiltersModal({ isOpen, onClose, initialFilters, onApply }) {
  const [filters, setFilters] = useState({
    category: 'All',
    collection: 'All',
    size: '',
    color: '',
    minPrice: '',
    maxPrice: '',
  })

  // Initialize filters when modal opens
  useEffect(() => {
    if (isOpen && initialFilters) {
      setFilters(initialFilters)
    }
  }, [isOpen, initialFilters])

  if (!isOpen) return null

  const handleReset = () => {
    setFilters({
      category: 'All',
      collection: 'All',
      size: '',
      color: '',
      minPrice: '',
      maxPrice: '',
    })
  }

  const handleApply = () => {
    onApply(filters)
    onClose()
  }

  const toggleSize = (size) => {
    setFilters((prev) => ({
      ...prev,
      size: prev.size === size ? '' : size,
    }))
  }

  const toggleColor = (colorName) => {
    setFilters((prev) => ({
      ...prev,
      color: prev.color === colorName ? '' : colorName,
    }))
  }

  const setQuickPrice = (min, max) => {
    setFilters((prev) => ({
      ...prev,
      minPrice: min.toString(),
      maxPrice: max.toString(),
    }))
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[9998] backdrop-blur-[2px] transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />
      {/* Modal Slide-up Drawer */}
      <div className="fixed inset-x-0 bottom-0 max-h-[85vh] bg-white rounded-t-[2rem] shadow-2xl z-[9999] overflow-hidden flex flex-col justify-between animate-slide-up border-t border-gray-100 lg:max-w-xl lg:mx-auto lg:rounded-2xl lg:bottom-1/2 lg:top-auto lg:translate-y-1/2 lg:max-h-none lg:h-[70vh]">
        {/* Modal Header */}
        <header className="px-6 py-5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <img src={closeIcon} alt="Close" className="w-4 h-4 opacity-60" />
          </button>
          <h2 className="text-base font-extrabold text-gray-900 tracking-wide">Filters</h2>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-bold text-gray-400 hover:text-brand-orange transition-colors"
          >
            Reset
          </button>
        </header>

        {/* Scrollable Filters Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Category Section */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Category</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, category: cat }))}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    filters.category === cat
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Collection Section */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Collection</h3>
            <div className="flex flex-wrap gap-2">
              {collections.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, collection: col }))}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    filters.collection === col
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          {/* Sizes Section */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sizes</h3>
            <div className="flex flex-wrap gap-2">
              {sizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => toggleSize(sz)}
                  className={`w-10 h-10 rounded-xl text-xs font-bold transition-all border flex items-center justify-center ${
                    filters.size === sz
                      ? 'bg-brand-orange text-white border-brand-orange shadow-inner'
                      : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Colors Section */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Color</h3>
            <div className="flex flex-wrap gap-3">
              {colors.map((c) => {
                const isSelected = filters.color === c.name
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggleColor(c.name)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all relative border ${
                      isSelected ? 'ring-2 ring-brand-orange ring-offset-2' : 'border-gray-100'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  >
                    {isSelected && (
                      <span
                        className={`text-[10px] font-black ${
                          c.name === 'White' ? 'text-gray-900' : 'text-white'
                        }`}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Price Range Section */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Price Range</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₱</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minPrice}
                  onChange={(e) => setFilters((p) => ({ ...p, minPrice: e.target.value }))}
                  className="w-full h-11 pl-7 pr-3 border border-gray-250 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                />
              </div>
              <span className="text-gray-300 font-bold">—</span>
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₱</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters((p) => ({ ...p, maxPrice: e.target.value }))}
                  className="w-full h-11 pl-7 pr-3 border border-gray-250 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                />
              </div>
            </div>

            {/* Quick Select Price Range pills */}
            <div className="flex gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => setQuickPrice(0, 500)}
                className="flex-1 py-2 text-center rounded-xl bg-gray-50 hover:bg-brand-orange/10 hover:text-brand-orange text-gray-500 text-[10px] font-bold border border-gray-100 transition-colors"
              >
                Under ₱500
              </button>
              <button
                type="button"
                onClick={() => setQuickPrice(500, 1000)}
                className="flex-1 py-2 text-center rounded-xl bg-gray-50 hover:bg-brand-orange/10 hover:text-brand-orange text-gray-500 text-[10px] font-bold border border-gray-100 transition-colors"
              >
                ₱500 – ₱1k
              </button>
              <button
                type="button"
                onClick={() => setQuickPrice(1000, 10000)}
                className="flex-1 py-2 text-center rounded-xl bg-gray-50 hover:bg-brand-orange/10 hover:text-brand-orange text-gray-500 text-[10px] font-bold border border-gray-100 transition-colors"
              >
                Over ₱1k
              </button>
            </div>
          </div>
        </div>

        {/* Sticky Apply Button */}
        <div className="p-6 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <Button onClick={handleApply} className="w-full h-12 rounded-full font-bold shadow-md">
            Apply Filters
          </Button>
        </div>
      </div>
    </>
  )
}

export default FiltersModal
