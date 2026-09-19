import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useWishlist } from '../hooks/useWishlist.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import ProductCard from '../components/ui/ProductCard.jsx'
import LoginPromptModal from '../components/ui/LoginPromptModal.jsx'
import { LockIcon, HeartIcon } from '../components/ui/Icons.jsx'

function Wishlist() {
  const { currentUser } = useAuth()
  const { wishlistItems } = useWishlist()
  const [showLogin, setShowLogin] = useState(false)

  return (
    <AppShell>
      <PageHeader title="Wishlist" backTo="/home" />
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 max-w-6xl mx-auto animate-fade-in">
        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-gray-900">My Wishlist</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-brand-orange text-xs font-black">
              {wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <Link
            to="/shop"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-brand-orange font-bold text-xs transition-colors cursor-pointer"
          >
            <span>Explore Campus Store</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {!currentUser ? (
          <div className="text-center py-16 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-xs p-8 max-w-md mx-auto">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center border border-orange-100 mb-3 text-brand-orange">
              <LockIcon className="w-7 h-7 text-brand-orange" />
            </div>
            <h3 className="font-extrabold text-gray-900 text-lg">Sign in to view your wishlist</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
              Save your favorite BU campus merch, apparel, and varsity jackets to view them anytime.
            </p>
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="mt-5 bg-brand-orange hover:bg-orange-600 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md active:scale-98 transition-all cursor-pointer"
            >
              Sign In
            </button>
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="text-center py-16 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-xs p-8 max-w-md mx-auto">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-200 mb-3">
              <HeartIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-extrabold text-gray-900 text-lg">Your wishlist is empty</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-[260px] mx-auto leading-relaxed">
              Browse the university merchandise catalog and click the heart icon to save products here.
            </p>
            <Link
              to="/shop"
              className="mt-5 inline-flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md active:scale-98 transition-all"
            >
              <span>Browse Catalog</span>
              <span>→</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {wishlistItems.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      <LoginPromptModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        message="Sign in to access your wishlist."
      />
    </AppShell>
  )
}

export default Wishlist
