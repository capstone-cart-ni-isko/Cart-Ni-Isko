import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

/**
 * Auth-style layout:
 * - Mobile (<md): full-bleed single column with the inner content
 * - Desktop (md+): centered card with a rounded shadow
 * - Wide desktop (lg+): split panel — branded gradient on the left, form card on the right
 */
function AuthLayout({ children, panelTitle = 'Wear the pride.', panelSubtitle = 'Carry the identity, and support the Iskolar ng Bayan.' }) {
  return (
    <div className="min-h-dvh bg-gray-100 lg:bg-gray-200">
      <div className="lg:flex lg:items-center lg:justify-center lg:min-h-dvh lg:py-10 lg:px-6">
        <div className="lg:flex lg:bg-white lg:rounded-3xl lg:shadow-2xl lg:overflow-hidden lg:max-w-5xl lg:w-full">
          {/* Brand panel — desktop only */}
          <div className="hidden lg:flex lg:w-1/2 gradient-splash relative overflow-hidden flex-col justify-between p-12 text-white">
            <div className="absolute inset-0 opacity-[0.08] select-none pointer-events-none">
              <div className="watermark-text" style={{ top: '15%', left: '-10%' }}>TINDAHAN NI ISKO</div>
              <div className="watermark-text" style={{ bottom: '10%', right: '-15%' }}>ISKOLAR NG BAYAN</div>
            </div>

            <div className="relative z-10 flex items-center gap-3">
              <img src={brandLogo} alt="Tindahan ni Isko" className="w-12 h-12 object-contain brightness-0 invert" />
              <div>
                <p className="text-lg font-bold leading-tight">Tindahan</p>
                <p className="text-lg font-bold leading-tight opacity-90">ni Isko</p>
              </div>
            </div>

            <div className="relative z-10">
              <h2 className="text-4xl font-black leading-tight mb-3">{panelTitle}</h2>
              <p className="text-white/85 text-base leading-relaxed max-w-sm">{panelSubtitle}</p>
            </div>

            <div className="relative z-10 text-xs text-white/70 font-medium">© 2026 Tindahan ni Isko</div>
          </div>

          {/* Form panel */}
          <div className="lg:w-1/2">
            <div className="bg-white w-full md:max-w-md md:mx-auto md:my-6 md:rounded-2xl md:shadow-xl lg:shadow-none lg:my-0 lg:mx-0 lg:max-w-none lg:rounded-none">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout
