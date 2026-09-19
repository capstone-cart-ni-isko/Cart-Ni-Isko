import { Link } from 'react-router-dom'
import { GlobeIcon, MailIcon } from '../ui/Icons.jsx'

function DesktopFooter() {
  return (
    <footer className="hidden md:block bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-12 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-3">
          {/* Logo & Description */}
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-gray-900 tracking-wide">
              Tindahan <span className="text-brand-orange">ni Isko</span>
            </h3>
            <p className="text-[11px] text-gray-500 leading-relaxed max-w-[280px]">
              Your official source for Bicol University merchandise and apparel. Wear your pride.
            </p>
            <div className="flex gap-1.5 pt-0.5">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-6 h-6 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 hover:text-brand-orange hover:border-brand-orange transition-colors"
                title="Website"
              >
                <GlobeIcon className="w-3 h-3" />
              </a>
              <a
                href="mailto:support@tindahanniisko.com"
                className="w-6 h-6 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 hover:text-brand-orange hover:border-brand-orange transition-colors"
                title="Email"
              >
                <MailIcon className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* SUPPORT Column */}
          <div>
            <h4 className="text-[11px] font-bold text-gray-900 uppercase tracking-wider mb-1.5">SUPPORT</h4>
            <ul className="space-y-1">
              <li>
                <Link to="/help" className="text-[11px] text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  FAQ &amp; Size Guide
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-[11px] text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Shipping, Pickups &amp; Returns
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-[11px] text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Contact Support
                </Link>
              </li>
            </ul>
          </div>

          {/* INFORMATION Column */}
          <div>
            <h4 className="text-[11px] font-bold text-gray-900 uppercase tracking-wider mb-1.5">INFORMATION</h4>
            <ul className="space-y-1">
              <li>
                <Link to="/about" className="text-[11px] text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/orders" className="text-[11px] text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Order Tracking
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-[11px] text-gray-500 hover:text-brand-orange transition-colors font-medium">
                  Terms &amp; Privacy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-150 text-center md:flex md:justify-between md:items-center">
          <p className="text-[10px] text-gray-400 font-medium">
            &copy; 2026 Tindahan ni Isko. All rights reserved.
          </p>
          <p className="text-[10px] text-gray-400 font-medium mt-0.5 md:mt-0">
            Proudly supporting the Iskolar ng Bayan.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default DesktopFooter
