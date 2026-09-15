import { Link } from 'react-router-dom'

function DesktopFooter() {
  return (
    <footer className="hidden md:block bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-12 py-7">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-5">
          {/* Logo & Description */}
          <div className="space-y-2">
            <h3 className="text-base font-black text-gray-900 tracking-wide">
              Tindahan <span className="text-brand-orange">ni Isko</span>
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed max-w-[280px]">
              Your official source for Bicol University merchandise and apparel. Wear your pride.
            </p>
            <div className="flex gap-2 pt-1">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-brand-orange hover:border-brand-orange transition-colors text-xs"
              >
                🌐
              </a>
              <a
                href="mailto:support@tindahanniisko.com"
                className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-brand-orange hover:border-brand-orange transition-colors text-xs"
              >
                ✉
              </a>
            </div>
          </div>

          {/* Shop Column */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2.5">Shop</h4>
            <ul className="space-y-1.5">
              <li>
                <Link to="/shop" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  All Products
                </Link>
              </li>
              <li>
                <Link to="/shop" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link to="/shop" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Pre-orders
                </Link>
              </li>
              <li>
                <Link to="/shop" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Sale
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Column */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2.5">Support</h4>
            <ul className="space-y-1.5">
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Shipping & Returns
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Size Guide
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter Column */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Newsletter</h4>
            <p className="text-xs text-gray-500 font-medium">
              Subscribe to get updates on new releases.
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="flex gap-2 pt-0.5">
              <input
                type="email"
                placeholder="Email address"
                className="flex-1 h-9 px-3 rounded-lg border border-gray-300 text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange bg-white transition-all"
              />
              <button
                type="submit"
                className="h-9 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold rounded-lg text-xs transition-all shadow-xs active:scale-98 shrink-0"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <div className="pt-3.5 border-t border-gray-200 text-center md:flex md:justify-between md:items-center">
          <p className="text-[11px] text-gray-400 font-medium">
            © 2026 Tindahan ni Isko. All rights reserved.
          </p>
          <p className="text-[11px] text-gray-400 font-medium mt-1 md:mt-0">
            Proudly supporting the Iskolar ng Bayan.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default DesktopFooter
