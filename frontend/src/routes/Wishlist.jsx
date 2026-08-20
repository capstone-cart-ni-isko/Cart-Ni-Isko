import { useState } from 'react'
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
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in">
        {/* Desktop Page Title */}
        <h1 className="hidden lg:block text-3xl font-black text-gray-900 mb-8">My Wishlist</h1>
        {!currentUser ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <LockIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-700 mt-3">Sign in to view your wishlist</h3>
            <p className="text-sm text-gray-400 mt-2 max-w-[240px] mx-auto leading-relaxed">
              Save your favorite BU campus merch and come back to them anytime.
            </p>
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="mt-6 bg-brand-orange text-white font-bold text-sm px-6 py-2.5 rounded-full shadow-md hover:shadow-lg active:scale-98 transition-all"
            >
              Sign In
            </button>
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <HeartIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-700 mt-3">Your wishlist is empty</h3>
            <p className="text-sm text-gray-400 mt-2 max-w-[220px] mx-auto leading-relaxed">
              Browse the shop and tap the heart icon to save items here.
            </p>
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
