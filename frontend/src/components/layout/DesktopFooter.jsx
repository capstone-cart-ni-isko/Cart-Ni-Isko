import { Link } from 'react-router-dom'

function DesktopFooter() {
  return (
    <footer className="hidden md:block bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-12 py-7">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-5">
          {/* Logo & Description */}
          <div className="space-y-2">
            <h3 className="text-base font-black text-gray-900 tracking-wide">
              Tindahan <span className="text-brand-orange">ni Isko</span>
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed max-w-[320px]">
              Your official source for Bicol University merchandise and apparel. Wear your pride.
            </p>
            <div className="flex gap-2 pt-1">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-brand-orange hover:border-brand-orange transition-colors text-xs"
                title="Facebook"
              >
                🌐
              </a>
              <a
                href="mailto:support@tindahanniisko.com"
                className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-brand-orange hover:border-brand-orange transition-colors text-xs"
                title="Email"
              >
                ✉
              </a>
            </div>
          </div>

          {/* SUPPORT Column */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2.5">SUPPORT</h4>
            <ul className="space-y-1.5">
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Size Guide
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Shipping & Returns
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* INFORMATION Column */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2.5">INFORMATION</h4>
            <ul className="space-y-1.5">
              <li>
                <Link to="/about" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/orders" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Order Tracking
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-xs text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Privacy Policy
                </Link>
              </li>
            </ul>
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
