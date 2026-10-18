import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SearchInput from '../../components/ui/SearchInput.jsx'
import BackButton from '../../components/ui/BackButton.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import { fetchAdminProducts } from '../../services/adminProducts.js'
import { searchOrders, fetchAllOrders } from '../../services/orders.js'
import { fetchSearchHistory, recordSearchQuery, clearSearchHistory } from '../../services/products.js'
import { formatPrice } from '../../components/ui/PriceTag.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { ShirtIcon } from '../../components/ui/Icons.jsx'

/**
 * Focused Admin Search Page (following Rule 65 & Rule 68-70: focused page like Settings,
 * with top-left Back button, full standalone shell, instant past search history on click/focus,
 * and vertical stack results for Orders, Products, and other applicable records).
 */
export default function AdminSearch() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQ)

  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [activeOrderDetail, setActiveOrderDetail] = useState(null)

  // Past searches state
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Load history from DB (empsearch)
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

  // Keep query in URL
  useEffect(() => {
    const urlQ = searchParams.get('q') || ''
    if (urlQ !== query) {
      setQuery(urlQ)
    }
  }, [searchParams])

  // Fetch search results
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setProducts([])
      setOrders([])
      return
    }

    let isMounted = true
    setLoading(true)

    Promise.allSettled([
      fetchAdminProducts(),
      searchOrders(q).catch(() => null),
      fetchAllOrders().catch(() => []),
    ]).then(([prodRes, searchOrderRes, allOrderRes]) => {
      if (!isMounted) return

      // Products
      if (prodRes.status === 'fulfilled' && Array.isArray(prodRes.value)) {
        const matchedProds = prodRes.value.filter((p) => {
          const name = String(p.name || '').toLowerCase()
          const cat = String(p.category || p.categoryName || '').toLowerCase()
          const sku = String(p.sku || p.tag || '').toLowerCase()
          const desc = String(p.description || '').toLowerCase()
          return name.includes(q) || cat.includes(q) || sku.includes(q) || desc.includes(q)
        })
        setProducts(matchedProds)
      } else {
        setProducts([])
      }

      // Orders
      let matchedOrders = []
      if (searchOrderRes.status === 'fulfilled' && Array.isArray(searchOrderRes.value)) {
        matchedOrders = searchOrderRes.value
      } else if (allOrderRes.status === 'fulfilled' && Array.isArray(allOrderRes.value)) {
        matchedOrders = allOrderRes.value.filter((o) => {
          const id = String(o.order_id || o.id || '').toLowerCase()
          const cust = String(o.customer || o.cust_name || o.cust_email || '').toLowerCase()
          const status = String(o.order_status || o.status || '').toLowerCase()
          return id.includes(q) || cust.includes(q) || status.includes(q)
        })
      }

      const formattedOrders = matchedOrders.map((o) => ({
        id: o.order_id || o.id,
        customer: o.customer || o.cust_name || (o.customer_firstname ? `${o.customer_firstname} ${o.customer_lastname || ''}` : 'Customer'),
        email: o.cust_email || o.customer_email || '—',
        phone: o.cust_phone || o.customer_phone || '—',
        status: o.order_status || o.status || 'PENDING',
        total: Number(o.order_total || o.total || 0),
        fulfillment: o.order_fulfillment || o.fulfillment_type || 'PICKUP',
        date: o.order_created ? new Date(o.order_created).toLocaleDateString() : 'Recent',
        items: Array.isArray(o.items) ? o.items : [],
      }))

      setOrders(formattedOrders)
      setLoading(false)
    }).catch(() => {
      if (isMounted) setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [query])

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
      navigate('/admin/dashboard')
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

  return (
    <div className="admin-portal min-h-screen bg-[#F8F9FA] dark:bg-[var(--surface)] flex flex-col w-full font-sans antialiased text-gray-900 dark:text-[var(--ink)]">
      {/* ── Ribbon Bar (Domain 3 / Rule 69 / Rule 72): Search bar stays in the ribbon, Back button at top-left ── */}
      <header className="sticky top-0 z-40 select-none bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-[var(--line)] w-full px-4 md:px-6 h-14 flex items-center gap-3 shadow-2xs">
        {/* Working Back button at top-left to exit the search page */}
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
            placeholder="Search orders, products, customers..."
            aria-label="Search"
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

      {/* ── Main Area below the ribbon ── */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">

        {/* ── PAST SEARCHES SECTION (shown when query is empty, or as quick suggestions) ── */}
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
                <p className="text-xs">Searches you make on the admin portal will appear here for one-click access.</p>
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
                <p className="font-semibold text-sm text-[var(--ink)]">No matches found for "{query}"</p>
                <p className="text-xs text-[var(--muted)]">
                  Check spelling or try using different keywords.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* GROUP 1: Orders (Vertical Stack) */}
                {orders.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                      <h2 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-2">
                        <span>Orders</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-3)] text-[var(--ink)]">
                          {orders.length}
                        </span>
                      </h2>
                    </div>

                    <div className="space-y-2">
                      {orders.map((order) => (
                        <div
                          key={order.id}
                          onClick={() => setActiveOrderDetail(order)}
                          className="p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:border-brand-orange/40 hover:shadow-sm transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-[var(--ink)] group-hover:text-brand-orange transition-colors">
                                #{order.id}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-orange-500/10 text-brand-orange">
                                {order.status}
                              </span>
                              <span className="text-xs text-[var(--muted)]">
                                {order.fulfillment}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--ink-2)] truncate">
                              <strong>Customer:</strong> {order.customer} {order.email !== '—' && `(${order.email})`}
                            </p>
                            <p className="text-2xs text-[var(--muted)]">
                              Date: {order.date}
                            </p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                            <div className="text-right">
                              <p className="font-bold text-sm text-[var(--ink)]">
                                {formatPrice(order.total)}
                              </p>
                              <p className="text-2xs text-[var(--muted)]">
                                {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                              </p>
                            </div>
                            <span className="text-sm text-[var(--muted)] group-hover:text-brand-orange transition-colors">
                              →
                            </span>
                          </div>
                        </div>
                      ))}
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
                        const imgSrc = prod.image || prod.pic || (prod.variations?.[0]?.pic)
                        const prodTargetId = prod.id || prod.prodId || prod.prod_id
                        return (
                          <div
                            key={prodTargetId}
                            onClick={() => navigate(`/admin/inventory/${prodTargetId}`)}
                            className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:border-brand-orange/40 hover:shadow-sm transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
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
                                  <span>{prod.category || prod.categoryName}</span>
                                  <span>·</span>
                                  <span>Stock: <strong className="text-[var(--ink-2)]">{prod.qty ?? prod.stock ?? 0}</strong></span>
                                  {prod.sku && <span>· SKU: {prod.sku}</span>}
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

        {/* Order Details Drawer/Popup (Rule: jump into specific popup and return to search) */}
        {activeOrderDetail && (
          <DrawerPanel
            isOpen={Boolean(activeOrderDetail)}
            onClose={() => setActiveOrderDetail(null)}
            title={`Order #${activeOrderDetail.id}`}
            subtitle={`Placed: ${activeOrderDetail.date || '—'}`}
            width="max-w-xl"
            footer={
              <button
                type="button"
                onClick={() => setActiveOrderDetail(null)}
                className="btn btn--secondary w-full sm:w-auto"
              >
                Close
              </button>
            }
          >
            <div className="space-y-3.5 text-xs">
              <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-[var(--ink)]">Customer Details</span>
                  <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-orange-500/10 text-brand-orange">
                    {activeOrderDetail.status}
                  </span>
                </div>
                <p><strong className="text-[var(--ink-2)]">Name:</strong> {activeOrderDetail.customer}</p>
                <p><strong className="text-[var(--ink-2)]">Fulfillment:</strong> {activeOrderDetail.fulfillment}</p>
                <p><strong className="text-[var(--ink-2)]">Total Amount:</strong> {formatPrice(activeOrderDetail.total)}</p>
              </div>

              {activeOrderDetail.items?.length > 0 && (
                <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-2">
                  <span className="font-bold text-sm text-[var(--ink)] block">Items ({activeOrderDetail.items.length})</span>
                  <div className="divide-y divide-[var(--line)]">
                    {activeOrderDetail.items.map((item, idx) => (
                      <div key={idx} className="py-2 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-[var(--ink)]">{item.name || item.prod_name}</p>
                          <p className="text-2xs text-[var(--muted)]">Qty: {item.qty || 1}</p>
                        </div>
                        <span className="font-bold text-[var(--ink)]">{formatPrice(item.amount || item.price || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DrawerPanel>
        )}
      </main>
    </div>
  )
}
