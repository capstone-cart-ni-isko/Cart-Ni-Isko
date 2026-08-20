import { Link } from 'react-router-dom'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import AppShell from '../components/layout/AppShell.jsx'

function Welcome() {
  return (
    <AppShell showNav={false}>
      {/* MOBILE WELCOME CONTENT */}
      <div className="md:hidden w-full flex flex-col items-center justify-between min-h-[580px] p-8 animate-fade-in">
        <div />

        {/* Branding & Logo */}
        <div className="flex flex-col items-center text-center">
          <img
            src={logo}
            alt="Tindahan ni Isko"
            className="w-56 mb-8 hover:scale-105 transition-transform duration-300 drop-shadow-md"
          />
          <p className="text-gray-500 font-medium text-sm leading-relaxed max-w-[260px]">
            Wear the pride, carry the identity, and support the <span className="text-brand-orange font-semibold">Iskolar ng Bayan.</span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-3.5 mt-8">
          <Link
            to="/signup/role"
            className="block w-full h-12 leading-[3rem] text-center bg-brand-orange hover:bg-brand-orange-dark text-white font-bold rounded-full transition-all duration-200 shadow-md hover:shadow-lg active:scale-98"
          >
            Create an account
          </Link>

          <Link
            to="/signin"
            className="block w-full h-12 leading-[2.75rem] text-center border border-gray-200 hover:border-brand-orange hover:text-brand-orange text-gray-700 font-bold rounded-full transition-all duration-200 active:scale-98"
          >
            Sign In
          </Link>

          <Link
            to="/home"
            className="flex items-center justify-center gap-1.5 w-full pt-4 text-center text-gray-400 hover:text-brand-orange font-bold text-xs transition-colors duration-200"
          >
            <span>Explore as Guest</span>
            <span className="text-sm">➔</span>
          </Link>
        </div>

        <p className="text-[10px] text-gray-300 font-semibold mt-6">© 2026 Tindahan ni Isko</p>
      </div>

      {/* DESKTOP WELCOME CONTENT (Matching mockups) */}
      <div className="hidden md:flex flex-col items-center justify-between min-h-[480px] p-10 animate-fade-in bg-white">
        <div />

        {/* Branding & Logo */}
        <div className="flex flex-col items-center text-center">
          <img
            src={logo}
            alt="Tindahan ni Isko"
            className="w-64 mb-8 hover:scale-102 transition-transform duration-300"
          />
          <p className="text-gray-500 font-medium text-base leading-relaxed max-w-[320px]">
            Wear the pride, carry the identity, and support the <span className="text-brand-orange font-bold">Iskolar ng Bayan.</span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-3.5 mt-8">
          <Link
            to="/signup/role"
            className="block w-full h-12 leading-[3rem] text-center bg-brand-orange hover:bg-brand-orange-dark text-white font-bold rounded-xl transition-all duration-200 shadow-md active:scale-98"
          >
            Create an account
          </Link>

          <Link
            to="/signin"
            className="block w-full h-12 leading-[2.75rem] text-center border border-gray-250 hover:border-brand-orange hover:text-brand-orange text-gray-700 font-bold rounded-xl transition-all duration-200 active:scale-98"
          >
            Sign In
          </Link>

          <Link
            to="/home"
            className="flex items-center justify-center gap-1.5 w-full pt-4 text-center text-gray-400 hover:text-brand-orange font-bold text-sm transition-colors duration-200"
          >
            <span>Explore as Guest</span>
            <span className="text-sm">➔</span>
          </Link>
        </div>

        <p className="text-xs text-gray-400 font-semibold mt-8">© 2026 Tindahan ni Isko. All rights reserved.</p>
      </div>
    </AppShell>
  )
}

export default Welcome
