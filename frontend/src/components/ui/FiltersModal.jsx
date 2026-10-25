import { useState, useEffect } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { PRODUCT_CATEGORY_FILTERS } from '../../data/productCategories.js'

const sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL']

function FiltersModal({ isOpen, onClose, initialFilters, onApply, categoryOptions = PRODUCT_CATEGORY_FILTERS }) {
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

  const setQuickPrice = (min, max) => {
    setFilters((prev) => ({
      ...prev,
      minPrice: min.toString(),
      maxPrice: max.toString(),
    }))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
      sheet
      size="wide"
      footer={
        <>
          <Button variant="ghost" onClick={handleReset} className="mr-auto">
            Reset
          </Button>
          <Button variant="primary" onClick={handleApply}>
            Apply Filters
          </Button>
        </>
      }
    >
      <div className="modal-scroll space-y-4">
        {/* Category Section */}
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</h3>
          <div className="flex flex-wrap gap-1.5">
              {categoryOptions.map((cat) => (
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

        {/* Price Range Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Price Range</h3>
            {(filters.minPrice || filters.maxPrice) && (
              <button
                type="button"
                onClick={() => setFilters((p) => ({ ...p, minPrice: '', maxPrice: '' }))}
                className="text-[11px] font-semibold text-brand-orange hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setQuickPrice(0, 399)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                filters.minPrice === '0' && filters.maxPrice === '399'
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              ₱0 - ₱399
            </button>
            <button
              type="button"
              onClick={() => setQuickPrice(400, 699)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                filters.minPrice === '400' && filters.maxPrice === '699'
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              ₱400 - ₱699
            </button>
            <button
              type="button"
              onClick={() => setQuickPrice(700, 999)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                filters.minPrice === '700' && filters.maxPrice === '999'
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              ₱700 - ₱999
            </button>
            <button
              type="button"
              onClick={() => setQuickPrice(1000, 10000)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                filters.minPrice === '1000' && !filters.maxPrice
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              ₱1,000+
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">₱{filters.minPrice || '0'}</span>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value={filters.minPrice || '0'}
                onChange={(e) => {
                  const val = e.target.value
                  if (filters.maxPrice && parseInt(val) > parseInt(filters.maxPrice)) return
                  setFilters((p) => ({ ...p, minPrice: val === '0' ? '' : val }))
                }}
                className="flex-1 accent-brand-orange cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">₱{filters.maxPrice || '2000'}</span>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value={filters.maxPrice || '2000'}
                onChange={(e) => {
                  const val = e.target.value
                  if (filters.minPrice && parseInt(val) < parseInt(filters.minPrice)) return
                  setFilters((p) => ({ ...p, maxPrice: val === '2000' ? '' : val }))
                }}
                className="flex-1 accent-brand-orange cursor-pointer"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            {filters.minPrice && filters.maxPrice
              ? `₱${filters.minPrice} - ₱${filters.maxPrice}`
              : filters.minPrice
              ? `₱${filters.minPrice} & up`
              : filters.maxPrice
              ? `Up to ₱${filters.maxPrice}`
              : 'Any price'}
          </p>
        </div>
      </div>
    </Modal>
  )
}

export default FiltersModal
