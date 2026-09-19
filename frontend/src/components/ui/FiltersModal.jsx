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
        className="fixed inset-0 bg-slate-900/40 z-[9998] backdrop-blur-[2px] transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />
      {/* Modal Slide-up Drawer */}
      <div className="fixed inset-x-0 bottom-0 max-h-[85vh] bg-white rounded-t-lg z-[9999] overflow-hidden flex flex-col justify-between animate-slide-up border-t border-slate-200 lg:max-w-xl lg:mx-auto lg:rounded-lg lg:border lg:border-slate-200 lg:bottom-1/2 lg:top-auto lg:translate-y-1/2 lg:max-h-none lg:h-[70vh]">
        {/* Modal Header */}
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          >
            <img src={closeIcon} alt="Close" className="w-3.5 h-3.5 opacity-60" />
          </button>
          <h2 className="text-sm font-bold text-gray-900 tracking-wide">Filters</h2>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-semibold text-gray-500 hover:text-brand-orange transition-colors cursor-pointer"
          >
            Reset
          </button>
        </header>

        {/* Scrollable Filters Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Category Section */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</h3>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, category: cat }))}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all border cursor-pointer ${
                    filters.category === cat
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Collection Section */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Collection</h3>
            <div className="flex flex-wrap gap-1.5">
              {collections.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, collection: col }))}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all border cursor-pointer ${
                    filters.collection === col
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          {/* Sizes Section */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sizes</h3>
            <div className="flex flex-wrap gap-1.5">
              {sizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => toggleSize(sz)}
                  className={`w-8 h-8 rounded-md text-xs font-semibold transition-all border flex items-center justify-center cursor-pointer ${
                    filters.size === sz
                      ? 'bg-brand-orange text-white border-brand-orange'
                      : 'bg-white text-gray-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Colors Section */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</h3>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => {
                const isSelected = filters.color === c.name
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggleColor(c.name)}
                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-all relative border cursor-pointer ${
                      isSelected ? 'ring-2 ring-brand-orange ring-offset-1' : 'border-slate-200'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  >
                    {isSelected && (
                      <span
                        className={`text-[10px] font-bold ${
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
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Price Range</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₱</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minPrice}
                  onChange={(e) => setFilters((p) => ({ ...p, minPrice: e.target.value }))}
                  className="w-full h-8 pl-6 pr-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-brand-orange"
                />
              </div>
              <span className="text-gray-300 font-bold">—</span>
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₱</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters((p) => ({ ...p, minPrice: e.target.value }))}
                  className="w-full h-8 pl-6 pr-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-brand-orange"
                />
              </div>
            </div>

            {/* Quick Select Price Range pills */}
            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setQuickPrice(0, 500)}
                className="flex-1 py-1 text-center rounded-md bg-slate-50 hover:bg-slate-100 text-gray-600 text-[10px] font-semibold border border-slate-200 transition-colors cursor-pointer"
              >
                Under ₱500
              </button>
              <button
                type="button"
                onClick={() => setQuickPrice(500, 1000)}
                className="flex-1 py-1 text-center rounded-md bg-slate-50 hover:bg-slate-100 text-gray-600 text-[10px] font-semibold border border-slate-200 transition-colors cursor-pointer"
              >
                ₱500 – ₱1k
              </button>
              <button
                type="button"
                onClick={() => setQuickPrice(1000, 10000)}
                className="flex-1 py-1 text-center rounded-md bg-slate-50 hover:bg-slate-100 text-gray-600 text-[10px] font-semibold border border-slate-200 transition-colors cursor-pointer"
              >
                Over ₱1k
              </button>
            </div>
          </div>
        </div>

        {/* Sticky Apply Button */}
        <div className="p-3 border-t border-slate-200 bg-white sticky bottom-0 z-10">
          <Button onClick={handleApply} className="w-full h-8 rounded-md font-semibold text-xs">
            Apply Filters
          </Button>
        </div>
      </div>
    </>
  )
}

export default FiltersModal
