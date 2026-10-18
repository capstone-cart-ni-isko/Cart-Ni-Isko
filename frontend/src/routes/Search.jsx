import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import CustomerOrderDetailModal from '../components/orders/CustomerOrderDetailModal.jsx'
import { searchProducts, fetchSearchHistory, recordSearchQuery, clearSearchHistory } from '../services/products.js'
import { fetchOrders } from '../services/orders.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import { getImageUrl } from '../utils/imageUtils.js'
import { ShirtIcon } from '../components/ui/Icons.jsx'

/**
 * Focused Customer Search Page (following Rule 65 & Rule 68-70: focused page like Settings,
 * with top-left Back button, standalone FocusedLayout shell, instant past search history on click/focus,
 * and vertical stack results for Orders, Products, and other applicable records).
 */
export default function CustomerSearch() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQ)

  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState(null)

  // Past searches state
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Load history from DB (custsearch)
  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const rows = await fetchSearchHistory()
      setHistory(rows)
    } catch {
      // fallback
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  // Keep query synced with URL
  useEffect(() => {
    const urlQ = searchParams.get('q') || ''
    if (urlQ !== query) {
      setQuery(urlQ)
    }
  }, [searchParams])

  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setProducts([])
      setOrders([])
      return
    }

    let isMounted = true
    setLoading(true)

    const custId = currentUser?.cust_id ?? currentUser?.id

    Promise.allSettled([
      searchProducts(q),
      custId ? fetchOrders(custId).catch(() => []) : Promise.resolve([]),
    ]).then(([prodRes, orderRes]) => {
      if (!isMounted) return

      // Products
      if (prodRes.status === 'fulfilled' && Array.isArray(prodRes.value)) {
        setProducts(prodRes.value)
      } else {
        setProducts([])
      }

      // Customer's own orders matching query
      if (orderRes.status === 'fulfilled' && Array.isArray(orderRes.value)) {
        const matched = orderRes.value.filter((o) => {
          const id = String(o.ord_id || o.id || '').toLowerCase()
          const status = String(o.ord_status || o.status || '').toLowerCase()
          const items = Array.isArray(o.items)
            ? o.items.map((i) => i.name || i.prod_name).join(' ').toLowerCase()
            : ''
          return id.includes(q) || status.includes(q) || items.includes(q)
        })
        setOrders(matched)
      } else {
        setOrders([])
      }

      setLoading(false)
    }).catch(() => {
      if (isMounted) setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [query, currentUser])

  const executeSearch = (searchText) => {
    const trimmed = (searchText || '').trim()
    setQuery(trimmed)
    setSearchParams(trimmed ? { q: trimmed } : {})
    if (trimmed) {
      recordSearchQuery(trimmed).then(() => loadHistory()).catch(() => {})
    }
  }

  const handleSearchSubmit = (e) => {
    e?.preventDefault?.()
    executeSearch(query)
  }

  const handleClearHistoryItem = async (e, id) => {
    e.preventDefault()
    e.stopPropagation()
    await clearSearchHistory(id)
    setHistory((prev) => prev.filter((item) => item.id !== id))
  }

  const handleClearAllHistory = async () => {
    await clearSearchHistory()
    setHistory([])
  }

  // Handle returning / leaving focused page
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/home')
    }
  }

  const searchInputRef = useRef(null)
  const previousSearchesRef = useRef(null)

  // Exit search page strictly via the top-left Back button
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleBack()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const totalCount = products.length + orders.length

  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="customer-portal min-h-screen bg-[#F8F9FA] dark:bg-[var(--surface)] flex flex-col w-full customer-desktop-scale font-sans antialiased text-gray-900 dark:text-[var(--ink)]">
      {isOffline && (
        <div className="bg-amber-500 text-white text-xs font-semibold py-2 px-4 text-center sticky top-0 z-[99999]">
          You are currently offline. Browsing in cached mode.
        </div>
      )}
      {/* ── Focused Header Bar (Rule 65 / Rule 68 / Rule 69 / Rule 72): Search bar stays in the ribbon, Back button at top-left ── */}
      <header className="sticky top-0 z-40 select-none bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-[var(--line)] w-full px-4 md:px-6 h-14 flex items-center gap-3 shadow-2xs">
        {/* Working Back button at top-left (Rule 68, 69) */}
        <BackButton onClick={handleBack} />

        {/* Search bar stays in the ribbon */}
        <form onSubmit={handleSearchSubmit} className="flex-1 relative min-w-0" ref={searchInputRef}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, orders, hoodies, jackets..."
            aria-label="Search campus store"
            autoFocus
            className="w-full h-10 text-sm pl-10 pr-10 rounded-xl bg-slate-50 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-slate-900 dark:text-[var(--ink)] placeholder-gray-400 dark:placeholder-[var(--muted-2)] focus:outline-none focus:border-brand-orange focus:bg-white dark:focus:bg-[var(--surface)] transition-all shadow-2xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSearchParams({})
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </form>

        {/* Quick Clear All History if available */}
        {history.length > 0 && !query.trim() && (
          <button
            type="button"
            onClick={handleClearAllHistory}
            className="text-xs font-semibold text-[var(--muted)] hover:text-rose-600 transition-colors cursor-pointer shrink-0"
          >
            Clear History
          </button>
        )}
      </header>

      {/* ── Main Area below the ribbon: Results listed below ribbon ── */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 pb-16">

        {/* ── PAST SEARCHES SECTION (shown when query is empty) ── */}
        {!query.trim() && (
          <div className="space-y-4" ref={previousSearchesRef}>
            <div className="flex items-center justify-between pb-1 border-b border-[var(--line)]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-brand-orange">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Recent Searches</span>
              </h2>
              {history.length > 0 && (
                <span className="text-2xs text-[var(--muted)]">
                  {history.length} saved
                </span>
              )}
            </div>

            {loadingHistory ? (
              <div className="space-y-2">
                <div className="h-10 rounded-xl bg-[var(--surface-2)] animate-pulse" />
                <div className="h-10 rounded-xl bg-[var(--surface-2)] animate-pulse" />
              </div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] space-y-1">
                <p className="text-sm font-semibold text-[var(--ink)]">No past searches yet</p>
                <p className="text-xs">Your recent searches will appear here for one-click access.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[var(--line)]">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => executeSearch(item.query)}
                    className="flex items-center justify-between py-3.5 px-2 hover:bg-slate-50/80 dark:hover:bg-[var(--surface-2)] rounded-lg transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400 dark:text-[var(--muted)] group-hover:text-brand-orange shrink-0 transition-colors">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="text-sm font-medium text-slate-800 dark:text-[var(--ink)] truncate group-hover:text-brand-orange transition-colors">
                        {item.query}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {item.created_at && (
                        <span className="text-2xs text-slate-400 dark:text-[var(--muted)] hidden sm:inline">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleClearHistoryItem(e, item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="Remove search"
                        aria-label="Remove search"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SEARCH RESULTS (Vertical Stack Format) ── */}
        {query.trim() && (
          <div>
            {loading ? (
              <div className="space-y-4">
                <div className="h-24 rounded-xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
                <div className="h-24 rounded-xl border border-[var(--line)] bg-[var(--surface)] animate-pulse" />
              </div>
            ) : totalCount === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] space-y-2">
                <p className="font-semibold text-sm text-[var(--ink)]">No results found for "{query}"</p>
                <p className="text-xs text-[var(--muted)]">
                  Check your spelling or try more general keywords like "shirt", "hoodie", or "jacket".
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* GROUP 1: My Orders (Vertical Stack) */}
                {orders.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                      <h2 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-2">
                        <span>My Orders</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-3)] text-[var(--ink)]">
                          {orders.length}
                        </span>
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {orders.map((order) => {
                        const ordId = order.ord_id || order.id
                        const itemsCount = Array.isArray(order.items) ? order.items.length : 0
                        const total = Number(order.ord_total || order.total || 0)

                        return (
                          <div
                            key={`order-${ordId}`}
                            onClick={() => setSelectedOrderId(ordId)}
                            className="p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:border-brand-orange hover:shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 group"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-sm text-[var(--ink)] group-hover:text-brand-orange transition-colors">
                                  Order #{ordId}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-orange-500/10 text-brand-orange">
                                  {order.ord_status || order.status}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--muted)]">
                                {order.ord_created ? new Date(order.ord_created).toLocaleDateString() : 'Recent'} · {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                              </p>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                              <span className="font-bold text-sm text-[var(--ink)]">
                                {formatPrice(total)}
                              </span>
                              <span className="text-sm text-[var(--muted)] group-hover:text-brand-orange transition-colors">
                                →
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* GROUP 2: Products (Vertical Stack) */}
                {products.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                      <h2 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-2">
                        <span>Products</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-3)] text-[var(--ink)]">
                          {products.length}
                        </span>
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {products.map((prod) => {
                        const prodId = prod.prodId || prod.id || prod.tag
                        const imgSrc = prod.image || prod.main_image || ''

                        return (
                          <div
                            key={`prod-${prodId}`}
                            onClick={() => navigate(`/product/${prodId}`)}
                            className="p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:border-brand-orange hover:shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-14 h-14 rounded-lg border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center shrink-0 overflow-hidden p-1">
                                {imgSrc ? (
                                  <img src={getImageUrl(imgSrc)} alt={prod.name} className="w-full h-full object-contain" />
                                ) : (
                                  <ShirtIcon className="w-6 h-6 text-brand-orange opacity-40" />
                                )}
                              </div>
                              <div className="space-y-1 min-w-0">
                                <h3 className="text-sm font-bold text-[var(--ink)] truncate group-hover:text-brand-orange transition-colors">
                                  {prod.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                                  <span>{prod.category}</span>
                                  <span>·</span>
                                  <span className={prod.qty > 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-rose-500'}>
                                    {prod.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                              <span className="font-bold text-sm text-brand-orange">
                                {formatPrice(prod.price)}
                              </span>
                              <span className="text-sm text-[var(--muted)] group-hover:text-brand-orange transition-colors">
                                →
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Customer Order Detail Modal Popup */}
        {selectedOrderId && (
          <CustomerOrderDetailModal
            isOpen={Boolean(selectedOrderId)}
            onClose={() => setSelectedOrderId(null)}
            orderId={selectedOrderId}
            onOrderUpdated={() => {}}
          />
        )}
      </main>
    </div>
  )
}
