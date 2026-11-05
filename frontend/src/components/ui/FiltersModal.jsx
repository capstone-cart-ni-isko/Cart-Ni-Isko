import { useState, useEffect } from 'react'
import Modal from './Modal.jsx'
import { PRODUCT_CATEGORY_FILTERS } from '../../data/productCategories.js'
import { normalizeProductCategory } from '../../data/productCategories.js'
import { normalizeProductSizes } from '../../services/products.js'

const pricePresets = [
  { label: '₱0 – ₱399', min: 0, max: 399 },
  { label: '₱400 – ₱699', min: 400, max: 699 },
  { label: '₱700 – ₱999', min: 700, max: 999 },
  { label: '₱1,000 – ₱3,000', min: 1000, max: 3000 },
]
const MAX_PRICE = 3000

const emptyFilters = () => ({
  category: 'All',
  collection: 'All',
  size: '',
  color: '',
  minPrice: '',
  maxPrice: '',
})

const currency = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`

function availableSizes(products, category) {
  const values = products
    .filter((product) => category === 'All'
      || normalizeProductCategory(product.category, product.name) === normalizeProductCategory(category))
    .flatMap((product) => product.sizes || [])
  return normalizeProductSizes(values)
}

function filterCount(filters) {
  return Number(filters.category !== 'All')
    + Number(filters.collection !== 'All')
    + Number(Boolean(filters.size))
    + Number(Boolean(filters.color))
    + Number(Boolean(filters.minPrice || filters.maxPrice))
}

function FiltersModal({
  isOpen,
  onClose,
  initialFilters,
  onApply,
  categoryOptions = PRODUCT_CATEGORY_FILTERS,
  products = [],
  getResultCount = () => 0,
}) {
  const [filters, setFilters] = useState(emptyFilters)

  useEffect(() => {
    if (isOpen && initialFilters) setFilters(initialFilters)
  }, [isOpen, initialFilters])

  if (!isOpen) return null

  const activeCount = filterCount(filters)
  const minValue = filters.minPrice === '' ? 0 : Number(filters.minPrice)
  const maxValue = filters.maxPrice === '' ? MAX_PRICE : Number(filters.maxPrice)
  const rangeStart = `${(minValue / MAX_PRICE) * 100}%`
  const rangeEnd = `${(maxValue / MAX_PRICE) * 100}%`
  const sizes = availableSizes(products, filters.category)

  const handleReset = () => setFilters(emptyFilters())
  const handleApply = () => {
    onApply(filters)
    onClose()
  }
  const toggleSize = (size) => {
    setFilters((prev) => ({
      ...prev,
      size: prev.size.toLocaleLowerCase() === size.toLocaleLowerCase() ? '' : size,
    }))
  }
  const setQuickPrice = (min, max) => {
    setFilters((prev) => ({
      ...prev,
      minPrice: min ? String(min) : '',
      maxPrice: max == null ? '' : String(max),
    }))
  }
  const setMinimum = (value) => {
    setFilters((prev) => {
      const min = value === ''
        ? ''
        : String(Math.min(Number(value), MAX_PRICE, prev.maxPrice ? Number(prev.maxPrice) : MAX_PRICE))
      return { ...prev, minPrice: min }
    })
  }
  const setMaximum = (value) => {
    setFilters((prev) => {
      const max = value === ''
        ? ''
        : String(Math.max(
          prev.minPrice ? Number(prev.minPrice) : 0,
          Math.min(Number(value), MAX_PRICE)
        ))
      return { ...prev, maxPrice: max }
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      className="filter-products-modal"
      bodyClassName="filter-products-modal__body"
    >
      <div className="flex max-h-[84vh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 pb-2.5 pt-4 sm:px-6 sm:pt-5">
          <div>
            <h2 className="text-xl font-bold leading-tight tracking-tight text-slate-900">Filter Products</h2>
            <p className="mt-1 text-[13px] text-slate-500">Find products that match your preferences.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
            aria-label="Close filters"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
              <path d="m18 6-12 12M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="modal-scroll min-h-0 flex-1 divide-y divide-slate-200 px-4 sm:px-6">
          <section className="py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900">Category</h3>
              {filters.category !== 'All' && (
                <span className="text-xs font-semibold text-orange-600">1 selected</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categoryOptions.map((category) => {
                const selected = filters.category === category
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setFilters((prev) => ({
                      ...prev,
                      category,
                      size: availableSizes(products, category)
                        .some((size) => size.toLocaleLowerCase() === prev.size.toLocaleLowerCase())
                        ? prev.size
                        : '',
                    }))}
                    aria-pressed={selected}
                    className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                      selected
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                    }`}
                  >
                    {selected && category !== 'All' && (
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                        <path d="m4 10 4 4 8-8" />
                      </svg>
                    )}
                    {category}
                  </button>
                )
              })}
            </div>
          </section>

          {sizes.length > 0 && (
            <section className="py-3">
              <h3 className="text-base font-bold text-slate-900">Sizes</h3>
              <p className="mb-2 text-xs text-slate-500">Select available sizes</p>
              <div className="flex flex-wrap gap-1.5">
                {sizes.map((size) => {
                  const selected = filters.size.toLocaleLowerCase() === size.toLocaleLowerCase()
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleSize(size)}
                      aria-pressed={selected}
                      className={`min-h-9 min-w-12 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                        selected
                          ? 'border-orange-500 bg-orange-500 text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {size}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section className="py-3">
            <h3 className="text-base font-bold text-slate-900">Price Range</h3>
            <p className="mb-2 text-xs text-slate-500">Choose a preset or customize your budget.</p>
            <div className="flex flex-wrap gap-1.5">
              {pricePresets.map(({ label, min, max }) => {
                const selected = Number(filters.minPrice || 0) === min
                  && (max == null ? !filters.maxPrice : Number(filters.maxPrice) === max)
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setQuickPrice(min, max)}
                    aria-pressed={selected}
                    className={`min-h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                      selected
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <h4 className="text-[13px] font-semibold text-slate-900">Custom Range</h4>
              <span className="text-xs font-medium text-slate-500">
                {currency(minValue)} – {filters.maxPrice ? currency(maxValue) : 'No limit'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <label className="rounded-lg border border-slate-300 px-3 py-1.5 focus-within:border-slate-400">
                <span className="block text-xs text-slate-500">Minimum Price</span>
                <span className="flex items-center gap-1 text-sm font-bold text-slate-900">
                  <span aria-hidden="true">₱</span>
                  <input
                    type="number"
                    min="0"
                    max={MAX_PRICE}
                    value={filters.minPrice}
                    onChange={(event) => setMinimum(event.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent text-sm outline-none focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-1"
                    aria-label="Minimum price"
                  />
                </span>
              </label>
              <label className="rounded-lg border border-slate-300 px-3 py-1.5 focus-within:border-slate-400">
                <span className="block text-xs text-slate-500">Maximum Price</span>
                <span className="flex items-center gap-1 text-sm font-bold text-slate-900">
                  <span aria-hidden="true">₱</span>
                  <input
                    type="number"
                    min={minValue}
                    max={MAX_PRICE}
                    value={filters.maxPrice}
                    onChange={(event) => setMaximum(event.target.value)}
                    placeholder={String(MAX_PRICE)}
                    className="w-full bg-transparent text-sm outline-none focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-1"
                    aria-label="Maximum price"
                  />
                </span>
              </label>
            </div>

            <div
              className="filter-range-track mt-3"
              style={{ '--range-start': rangeStart, '--range-end': rangeEnd }}
            >
              <input
                type="range"
                min="0"
                max={filters.maxPrice ? Number(filters.maxPrice) : MAX_PRICE}
                step="50"
                value={Math.min(minValue, maxValue, MAX_PRICE)}
                onChange={(event) => setMinimum(event.target.value === '0' ? '' : event.target.value)}
                aria-label="Minimum price slider"
              />
              <input
                type="range"
                min="0"
                max={MAX_PRICE}
                step="50"
                value={Math.min(maxValue, MAX_PRICE)}
                onChange={(event) => setMaximum(event.target.value)}
                aria-label="Maximum price slider"
              />
            </div>
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>₱0</span>
              <span>{currency(MAX_PRICE)}</span>
            </div>
          </section>
        </div>

        <footer className="border-t border-slate-200 px-4 py-3 sm:px-6">
          <div className="mb-2.5 flex items-center gap-4 text-xs">
            <span className="text-slate-500">{activeCount} {activeCount === 1 ? 'filter' : 'filters'} selected</span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="font-semibold text-orange-600 hover:text-orange-700"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="min-h-10 flex-1 rounded-lg border border-slate-400 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="min-h-10 flex-[2.25] rounded-lg bg-orange-500 px-4 text-sm font-bold text-white transition-colors hover:bg-orange-600"
            >
              Show {getResultCount(filters)} Products
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  )
}

export default FiltersModal
