import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import ProductCard from '../components/ui/ProductCard.jsx'
import FiltersModal from '../components/ui/FiltersModal.jsx'
import productsData from '../data/products.json'
import backIcon from '../assets/icons/common/back.svg'
import searchIcon from '../assets/icons/common/search.svg'

const categories = ['All', 'Shirts', 'Hoodie', 'Cap', 'Lanyard', 'Stickers', 'Pins', 'Windbreaker', 'Varsity Jacket']

function Shop() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [filterModalOpen, setFilterModalOpen] = useState(false)

  // Full filter criteria state
  const [activeFilters, setActiveFilters] = useState({
    category: 'All',
    collection: 'All',
    size: '',
    color: '',
    minPrice: '',
    maxPrice: '',
  })

  // Initialize search from query parameter
  useEffect(() => {
    const searchVal = searchParams.get('search')
    if (searchVal) {
      setQuery(searchVal)
    } else {
      setQuery('')
    }
    
    // Also support category query params if clicking from navbar
    const catVal = searchParams.get('category')
    if (catVal) {
      setActiveFilters((prev) => ({
        ...prev,
        category: catVal,
      }))
    }
  }, [searchParams])

  // Handle category pill changes
  const handleCategoryPillClick = (cat) => {
    setActiveFilters((prev) => ({
      ...prev,
      category: cat,
    }))
  }

  // Filter products logic
  const filteredProducts = productsData.filter((prod) => {
    // 1. Search Query filter (matches name, description or category)
    if (query.trim()) {
      const q = query.toLowerCase()
      const match =
        prod.name.toLowerCase().includes(q) ||
        prod.description.toLowerCase().includes(q) ||
        prod.category.toLowerCase().includes(q)
      if (!match) return false
    }

    // 2. Category filter
    if (activeFilters.category !== 'All' && prod.category !== activeFilters.category) {
      return false
    }

    // 3. Collection filter
    if (activeFilters.collection !== 'All') {
      const isBUnique = activeFilters.collection === 'BUnique Collection' && prod.name.includes('BUnique')
      const isClassic = activeFilters.collection === 'Classic BU' && (prod.name.includes('Polo') || prod.name.includes('Varsity'))
      const isEssentials = activeFilters.collection === 'Essentials' && (!prod.name.includes('BUnique') && !prod.name.includes('Polo'))
      
      if (activeFilters.collection === 'BUnique Collection' && !isBUnique) return false
      if (activeFilters.collection === 'Classic BU' && !isClassic) return false
      if (activeFilters.collection === 'Essentials' && !isEssentials) return false
    }

    // 4. Size filter
    if (activeFilters.size && !prod.sizes.includes(activeFilters.size)) {
      return false
    }

    // 5. Color filter
    if (activeFilters.color && !prod.colors.some((c) => c.name === activeFilters.color)) {
      return false
    }

    // 6. Price Range filter
    const min = parseFloat(activeFilters.minPrice)
    const max = parseFloat(activeFilters.maxPrice)
    if (!isNaN(min) && prod.price < min) return false
    if (!isNaN(max) && prod.price > max) return false

    return true
  })

  const handleApplyFilters = (newFilters) => {
    setActiveFilters(newFilters)
  }

  return (
    <AppShell>
      <div className="pb-28">
        {/* Sticky search header - hidden on desktop */}
        <header className="bg-white border-b border-gray-50 px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30 lg:hidden">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center shrink-0"
          >
            <img src={backIcon} alt="Back" className="w-5 h-5" />
          </button>

          {/* Search Input bar */}
          <div className="flex-1 relative">
            <img src={searchIcon} alt="" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
            <input
              type="search"
              placeholder="Search campus gear..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-full bg-gray-50 border border-transparent text-sm placeholder-gray-400 focus:outline-none focus:bg-white focus:border-gray-200 focus:ring-2 focus:ring-brand-orange/20 transition-all"
            />
          </div>

          {/* Filter button */}
          <button
            type="button"
            onClick={() => setFilterModalOpen(true)}
            className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 active:scale-95 transition-all ${
              Object.values(activeFilters).some((v, i) => (i === 0 ? v !== 'All' : i === 1 ? v !== 'All' : !!v))
                ? 'bg-brand-orange border-brand-orange text-white'
                : 'bg-white border-gray-150 text-gray-700'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4.5 h-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="2" y1="14" x2="6" y2="14" />
              <line x1="10" y1="8" x2="14" y2="8" />
              <line x1="18" y1="16" x2="22" y2="16" />
            </svg>
          </button>
        </header>

        {/* Desktop-specific shop toolbar */}
        <div className="hidden lg:flex items-center justify-between border-b border-gray-200 pb-5 mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Shop Merchandise</h1>
            {query.trim() && (
              <p className="text-sm text-gray-400 mt-1">
                Showing results for <span className="font-bold text-gray-700">"{query}"</span>
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {/* Filter button */}
            <button
              type="button"
              onClick={() => setFilterModalOpen(true)}
              className={`h-10 px-5 rounded-xl border flex items-center gap-2 text-sm font-bold active:scale-95 transition-all cursor-pointer ${
                Object.values(activeFilters).some((v, i) => (i === 0 ? v !== 'All' : i === 1 ? v !== 'All' : !!v))
                  ? 'bg-brand-orange border-brand-orange text-white'
                  : 'bg-white border-gray-250 text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="2" y1="14" x2="6" y2="14" />
                <line x1="10" y1="8" x2="14" y2="8" />
                <line x1="18" y1="16" x2="22" y2="16" />
              </svg>
              <span>Filters</span>
            </button>
          </div>
        </div>

        {/* Horizontally scrollable Category pills - wraps on desktop */}
        <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-gray-50/50 scrollbar-none select-none lg:bg-transparent lg:px-0 lg:py-0 lg:flex-wrap lg:mb-8">
          {categories.map((cat) => {
            const isActive = activeFilters.category === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategoryPillClick(cat)}
                className={`px-4.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-brand-orange border-brand-orange text-white shadow-sm'
                    : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'
                }`}
              >
                {cat}
              </button>
            )
          })}
        </div>

        {/* Results grid */}
        <div className="px-4 py-4 lg:px-0 lg:py-0">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 animate-fade-in">
              <div className="w-16 h-16 bg-gray-55 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-gray-400">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-700">No results found</h3>
              <p className="text-sm text-gray-450 mt-1 max-w-[220px] mx-auto leading-relaxed">
                We couldn't find anything matching your filters. Try resetting them.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 animate-fade-in">
              {filteredProducts.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>
          )}
        </div>
      </div>

      <FiltersModal
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        initialFilters={activeFilters}
        onApply={handleApplyFilters}
      />
    </AppShell>
  )
}

export default Shop
