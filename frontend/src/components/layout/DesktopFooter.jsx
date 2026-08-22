import { Link } from 'react-router-dom'

function DesktopFooter() {
  return (
    <footer className="hidden md:block bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Logo & Description */}
          <div className="space-y-4">
            <h3 className="text-lg font-black text-gray-900 tracking-wide">
              Tindahan <span className="text-brand-orange">ni Isko</span>
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Your official source for Bicol University merchandise and apparel. Wear your pride.
            </p>
            <div className="flex gap-3 pt-2">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:text-brand-orange hover:border-brand-orange transition-colors"
              >
                🌐
              </a>
              <a
                href="mailto:support@tindahanniisko.com"
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:text-brand-orange hover:border-brand-orange transition-colors"
              >
                ✉
              </a>
            </div>
          </div>

          {/* Shop Column */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Shop</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/shop" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  All Products
                </Link>
              </li>
              <li>
                <Link to="/shop" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link to="/shop" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Pre-orders
                </Link>
              </li>
              <li>
                <Link to="/shop" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Sale
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Column */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Support</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/help" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Shipping & Returns
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Size Guide
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-sm text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter Column */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">Newsletter</h4>
            <p className="text-sm text-gray-500 font-medium">
              Subscribe to get updates on new releases.
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
              <input
                type="email"
                placeholder="Email address"
                className="flex-1 h-11 px-4 rounded-xl border border-gray-300 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange bg-white transition-all"
              />
              <button
                type="submit"
                className="h-11 px-5 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-98"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-200 text-center md:flex md:justify-between md:items-center">
          <p className="text-xs text-gray-400 font-semibold">
            © 2026 Tindahan ni Isko. All rights reserved.
          </p>
          <p className="text-xs text-gray-350 font-semibold mt-2 md:mt-0">
            Proudly supporting the Iskolar ng Bayan.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default DesktopFooter
