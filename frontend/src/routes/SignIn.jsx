import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useApiWarmup } from '../hooks/useApi.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import brandLogo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import merchStoreIcon from '../assets/Branding/Copy of store.png'
import merchShirtIcon from '../assets/Branding/Copy of shirt.png'
import merchCapIcon from '../assets/Branding/Copy of cap.png'
import merchJacketIcon from '../assets/Branding/Copy of jacket.png'
import merchLanyardIcon from '../assets/Branding/Copy of lanyard.png'
import merchBadgeIcon from '../assets/Branding/Copy of badge.png'
import sparkIcon from '../assets/Branding/Copy of sparkle(1).png'
import starIcon from '../assets/Branding/Copy of star(1).png'

/**
 * Shown the instant Login is clicked, before the response lands. Keeps the
 * button's own space so the layout never jumps while the request is in flight.
 */
function AuthenticatingSkeleton() {
  return (
    <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
      Authenticating…
    </span>
  )
}

/** FLOW-CUST_LOGIN-04: the typed identifier is remembered for this session. */
const DRAFT_KEY = 'isko_login_draft'

function readDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    return { identifier: draft?.identifier || '', password: '' }
  } catch {
    return { identifier: '', password: '' }
  }
}

function SignIn() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { showToast } = useToast()
  // Fires on the first field focus: DNS + TCP + TLS to the API and the public
  // catalog read are done before the customer can possibly submit.
  const warmApi = useApiWarmup()

  // FLOW-CUST_LOGIN-04 / REQ-CUST_LOGIN-02: what was typed survives a
  // reload, a tab switch and a rejected attempt - only the password is kept
  // in React state, never written to storage.
  const [form, setForm] = useState(readDraft)
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ identifier: form.identifier }))
    } catch {
      // A blocked storage only costs the draft, never the screen.
    }
  }, [form.identifier])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // REQ-CUST_LOGIN-03: an error is dropped the moment the field is fixed.
    setServerError('')
  }

  /**
   * FLOW-CUST_LOGIN-05 / REQ-CUST_LOGIN-05: specific feedback per field, and
   * only once the customer has actually been in that field.
   */
  function fieldError(name) {
    if (!touched[name]) return ''
    const value = String(form[name] || '').trim()

    if (name === 'identifier') {
      if (!value) return 'Enter your phone number.'
      if (value.replace(/\D/g, '').length < 10) {
        return 'Enter a valid phone number.'
      }
      return ''
    }

    if (name === 'password') {
      if (!value) return 'Enter your password.'
      if (value.length < 8) return 'Password must be at least 8 characters.'
    }

    return ''
  }

  const identifierError = fieldError('identifier')
  const passwordError = fieldError('password')
  const identifierOk =
    form.identifier.trim().length > 0 && !identifierError && touched.identifier
  const formValid =
    Boolean(!identifierError && !passwordError && form.identifier.trim() && form.password)

  async function handleSubmit(e) {
    e.preventDefault()

    // Never submit blind: mark every field so each problem is on screen.
    setTouched({ identifier: true, password: true })
    if (identifierError || passwordError || !form.identifier.trim() || !form.password) return

    setIsSubmitting(true)
    const result = await login(form.identifier.trim(), form.password)
    setIsSubmitting(false)

    // FLOW-CUST_LOGIN-02: the password was right but the OTP gate opened.
    // The form keeps everything typed (REQ-CUST_LOGIN-02) and the challenge
    // is carried to the verification screen.
    if (result.requiresOtp) {
      showToast('A verification code was sent to your notification inbox.')
      navigate('/verify-otp', {
        state: {
          challenge: result.challenge,
          phone: result.phone,
          purpose: result.purpose,
          fromSignIn: true,
        },
      })
      return
    }

    if (result.error || !result.user) {
      // REQ-CUST_LOGIN-02: the form is neither refreshed nor emptied.
      const errorText = result.error || 'Cannot reach the server. Please check your connection.'
      setServerError(errorText)
      showToast(errorText, 'error')
      return
    }

    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* nothing to clean up */
    }
    showToast('Signed in successfully!')
    // FLOW-CUST_LOGIN-03: straight to the storefront, no further login.
    navigate('/home')
  }

  const phoneField = (idPrefix) => (
    <div>
      <label
        htmlFor={`${idPrefix}-identifier`}
        className="field-label"
      >
        Phone Number
      </label>
      <div className="relative">
        <input
          id={`${idPrefix}-identifier`}
          type="tel"
          name="identifier"
          autoComplete="tel"
          inputMode="tel"
          placeholder="09XX XXX XXXX"
          value={form.identifier}
          onChange={handleChange}
          onFocus={() => {
            warmApi()
            setTouched((prev) => (prev.identifier ? prev : { ...prev, identifier: true }))
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, identifier: true }))}
          aria-invalid={identifierError ? 'true' : undefined}
          className={`field-input field-input--lg pr-10 ${
            identifierError ? 'field-input--error' : ''
          }`}
        />
        {identifierOk && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#16A34A] text-white text-xs font-semibold animate-scale-in">
            ✓
          </span>
        )}
      </div>
      {identifierError && <p className="field-error">{identifierError}</p>}
      {!identifierError && (
        <p className="field-hint">
          Enter the phone number registered to your account.
        </p>
      )}
    </div>
  )

  const passwordField = (idPrefix) => (
    <div>
      <label
        htmlFor={`${idPrefix}-password`}
        className="field-label"
      >
        Password
      </label>
      <div className="relative">
        <input
          id={`${idPrefix}-password`}
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="Enter password"
          value={form.password}
          onChange={handleChange}
          onFocus={() => {
            warmApi()
            setTouched((prev) => (prev.password ? prev : { ...prev, password: true }))
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          aria-invalid={passwordError ? 'true' : undefined}
          className="field-input field-input--lg pr-20"
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-brand-orange transition-colors"
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      {passwordError && <p className="field-error">{passwordError}</p>}
    </div>
  )

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col justify-center items-center p-4 font-sans bg-slate-50/70 dark:bg-[var(--surface-2)] relative select-none">
      {/* Subtle Campus-Themed Background Elements with Festive Isko/Iska Characters & Confetti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Gentle brand aura radial glows */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-orange/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-80 h-80 rounded-full bg-amber-300/10 blur-3xl" />

        {/* LEFT WING: Cheerful Campus Isko & Student Life Vector Artwork */}
        <div className="absolute left-6 xl:left-14 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center">
          <div className="relative w-72 xl:w-88 h-96 flex items-center justify-center">
            {/* Floating Book 1 */}
            <div className="absolute top-4 left-6 -rotate-12 w-10 h-12 bg-sky-600 rounded-sm shadow-md border-l-4 border-sky-800 flex items-center justify-center text-white text-[10px] font-bold">
              BU
            </div>
            {/* Floating Book 2 */}
            <div className="absolute top-20 right-6 rotate-12 w-9 h-11 bg-orange-500 rounded-sm shadow-md border-l-3 border-orange-700 flex items-center justify-center text-white text-[9px] font-bold">
              USC
            </div>
            {/* Floating Ribbon */}
            <div className="absolute bottom-12 left-8 rotate-45 w-12 h-3 bg-sky-500 rounded-full shadow-xs" />
            {/* Merch stickers floating */}
            <img src={merchShirtIcon} alt="" className="absolute top-28 left-4 w-10 h-10 object-contain drop-shadow-md opacity-85 animate-bounce [animation-duration:4s]" />
            <img src={merchCapIcon} alt="" className="absolute bottom-20 right-4 w-9 h-9 object-contain drop-shadow-md opacity-85 animate-pulse" />
            <img src={sparkIcon} alt="" className="absolute top-10 right-20 w-6 h-6 object-contain opacity-70" />
            <img src={starIcon} alt="" className="absolute bottom-6 right-20 w-6 h-6 object-contain opacity-70" />

            {/* Confetti dots using strictly blue, orange, black, white, and gray */}
            <span className="absolute top-12 left-28 w-3 h-3 rounded-full bg-orange-500 opacity-80" />
            <span className="absolute top-36 left-20 w-2.5 h-2.5 rounded-full bg-sky-600 opacity-80" />
            <span className="absolute top-8 right-12 w-3.5 h-3.5 rounded-full bg-orange-400 opacity-80" />
            <span className="absolute bottom-24 left-14 w-3 h-3 rounded-full bg-sky-500 opacity-80" />
            <span className="absolute bottom-10 right-10 w-2.5 h-2.5 rounded-full bg-slate-700 opacity-80" />

            {/* Cheerful Student Vector Illustration (Stylized Isko & Iska) */}
            <svg viewBox="0 0 240 280" className="w-64 xl:w-76 h-auto drop-shadow-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* ISKO (Left) */}
              <g className="animate-fade-in">
                {/* Raised Left Arm (Naturally proportioned with orange sleeve and bent elbow cheering up towards BU card) */}
                <path d="M 64 105 L 46 76" stroke="#EA580C" strokeWidth="14" strokeLinecap="round" />
                <path d="M 46 76 L 38 48" stroke="#FED7AA" strokeWidth="11" strokeLinecap="round" />
                <circle cx="37" cy="44" r="8" fill="#FED7AA" />

                {/* Head base */}
                <circle cx="82" cy="78" r="23" fill="#FED7AA" />
                {/* Ears */}
                <circle cx="59" cy="80" r="4.5" fill="#FED7AA" />
                <circle cx="105" cy="80" r="4.5" fill="#FED7AA" />

                {/* Isko Hair (Full, stylish, neat student haircut with volume and fringe — no bald comb-over) */}
                <path d="M 57 80 C 54 52, 70 42, 84 42 C 98 42, 110 52, 107 80 C 103 66, 94 60, 84 62 C 73 64, 65 72, 57 80 Z" fill="#0F172A" />
                <path d="M 61 74 C 70 66, 80 65, 87 68 C 94 65, 102 68, 105 76 C 100 70, 92 68, 85 71 C 77 74, 68 77, 61 74 Z" fill="#1E293B" />

                {/* Eyebrows */}
                <path d="M 70 72 Q 75 69 80 71" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
                <path d="M 86 71 Q 91 69 96 72" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />

                {/* Eyes with sparkle */}
                <circle cx="75" cy="79" r="2.5" fill="#0F172A" />
                <circle cx="76" cy="78" r="0.8" fill="#FFFFFF" />
                <circle cx="91" cy="79" r="2.5" fill="#0F172A" />
                <circle cx="92" cy="78" r="0.8" fill="#FFFFFF" />

                {/* Rosy Cheeks */}
                <ellipse cx="71" cy="85" rx="3.5" ry="2" fill="#F87171" opacity="0.4" />
                <ellipse cx="95" cy="85" rx="3.5" ry="2" fill="#F87171" opacity="0.4" />

                {/* Smile */}
                <path d="M 78 86 Q 83 93 88 86" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" />

                {/* Right Arm (Relaxed by side) */}
                <path d="M 102 105 L 110 136" stroke="#EA580C" strokeWidth="13" strokeLinecap="round" />
                <path d="M 110 136 L 109 152" stroke="#FED7AA" strokeWidth="10" strokeLinecap="round" />
                <circle cx="108" cy="154" r="5.5" fill="#FED7AA" />

                {/* Orange Shirt / Polo */}
                <path d="M 58 104 L 106 104 L 112 176 L 52 176 Z" fill="#EA580C" rx="10" />
                <path d="M 74 104 L 82 113 L 90 104" stroke="#C2410C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Crossbody Bag Strap & Bag */}
                <line x1="62" y1="104" x2="110" y2="172" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" />
                <rect x="98" y="156" width="22" height="24" rx="5" fill="#0F172A" />
                <rect x="105" y="166" width="8" height="4" rx="1" fill="#475569" />

                {/* Pants */}
                <rect x="62" y="176" width="17" height="70" rx="5" fill="#334155" />
                <rect x="85" y="176" width="17" height="70" rx="5" fill="#334155" />

                {/* Shoes */}
                <ellipse cx="70" cy="252" rx="12" ry="6" fill="#0F172A" />
                <path d="M 60 254 Q 70 256 80 254" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
                <ellipse cx="93" cy="252" rx="12" ry="6" fill="#0F172A" />
                <path d="M 83 254 Q 93 256 103 254" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
              </g>

              {/* ISKA (Right) */}
              <g className="animate-fade-in">
                {/* Back hair volume resting on shoulders */}
                <path d="M 134 88 C 126 105, 126 132, 134 142 C 140 136, 140 120, 140 110 L 176 110 C 176 120, 176 136, 182 142 C 190 132, 190 105, 182 88 Z" fill="#0F172A" />

                {/* Head base */}
                <circle cx="158" cy="88" r="23" fill="#FED7AA" />
                {/* Ears */}
                <circle cx="135" cy="90" r="4.5" fill="#FED7AA" />
                <circle cx="181" cy="90" r="4.5" fill="#FED7AA" />

                {/* Iska Hair (Cute bob/shoulder length with bangs and side framing locks — full volume) */}
                <path d="M 134 88 C 130 58, 145 48, 158 48 C 172 48, 186 58, 182 88 C 178 74, 170 68, 163 70 C 156 72, 150 67, 143 69 C 137 71, 135 78, 134 88 Z" fill="#0F172A" />
                <path d="M 134 88 C 133 98, 134 110, 137 118 C 139 110, 138 98, 137 90 Z" fill="#1E293B" />
                <path d="M 182 88 C 183 98, 182 110, 179 118 C 177 110, 178 98, 179 90 Z" fill="#1E293B" />

                {/* Eyebrows */}
                <path d="M 146 81 Q 150 78 154 80" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M 162 80 Q 166 78 170 81" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />

                {/* Eyes with sparkle & lash */}
                <circle cx="150" cy="87" r="2.5" fill="#0F172A" />
                <circle cx="151" cy="86" r="0.8" fill="#FFFFFF" />
                <path d="M 148 84 L 147 83" stroke="#0F172A" strokeWidth="1.2" strokeLinecap="round" />

                <circle cx="166" cy="87" r="2.5" fill="#0F172A" />
                <circle cx="167" cy="86" r="0.8" fill="#FFFFFF" />
                <path d="M 168 84 L 169 83" stroke="#0F172A" strokeWidth="1.2" strokeLinecap="round" />

                {/* Rosy Cheeks */}
                <ellipse cx="145" cy="93" rx="3.5" ry="2" fill="#F87171" opacity="0.5" />
                <ellipse cx="171" cy="93" rx="3.5" ry="2" fill="#F87171" opacity="0.5" />

                {/* Smile */}
                <path d="M 154 94 Q 158.5 100 163 94" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" />

                {/* BU Blue Shirt Body */}
                <path d="M 132 112 L 182 112 L 188 184 L 126 184 Z" fill="#0284C7" rx="10" />
                <path d="M 150 112 L 157 120 L 164 112" stroke="#0369A1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

                {/* Binder in hands */}
                <rect x="135" y="134" width="22" height="28" rx="3" fill="#0369A1" />
                <line x1="139" y1="134" x2="139" y2="162" stroke="#38BDF8" strokeWidth="2" />
                <rect x="144" y="142" width="9" height="12" rx="1" fill="#FFFFFF" opacity="0.85" />

                {/* Left Arm holding binder */}
                <path d="M 134 112 L 126 136" stroke="#0284C7" strokeWidth="12" strokeLinecap="round" />
                <path d="M 126 136 L 138 146" stroke="#FED7AA" strokeWidth="9" strokeLinecap="round" />
                <circle cx="138" cy="146" r="4.5" fill="#FED7AA" />

                {/* Right Arm holding binder */}
                <path d="M 180 112 L 176 136" stroke="#0284C7" strokeWidth="12" strokeLinecap="round" />
                <path d="M 176 136 L 157 146" stroke="#FED7AA" strokeWidth="9" strokeLinecap="round" />
                <circle cx="157" cy="146" r="4.5" fill="#FED7AA" />

                {/* Backpack strap */}
                <line x1="174" y1="112" x2="136" y2="180" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />

                {/* Dark Jeans */}
                <rect x="134" y="184" width="17" height="68" rx="5" fill="#0F172A" />
                <rect x="157" y="184" width="17" height="68" rx="5" fill="#0F172A" />

                {/* White Shoes with black outline */}
                <ellipse cx="142" cy="254" rx="12" ry="6" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
                <ellipse cx="165" cy="254" rx="12" ry="6" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
              </g>
            </svg>
          </div>
          <div className="mt-1 text-center">
            <span className="block text-xs font-bold text-slate-800 dark:text-[var(--ink)] tracking-tight">Magandang Araw, Isko at Iska!</span>
            <span className="block text-[11px] text-slate-500 dark:text-[var(--muted)] font-medium">Proud Bicolano Scholars &amp; Leaders</span>
          </div>
        </div>

        {/* RIGHT WING: Campus Store Hub, Merch Showcase & Confetti */}
        <div className="absolute right-6 xl:right-14 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center">
          <div className="relative w-64 xl:w-76 h-96 flex flex-col justify-center items-center">
            {/* Confetti elements right using strictly blue, orange, black, white, and gray */}
            <span className="absolute top-10 left-8 w-3 h-3 rounded-full bg-orange-500 opacity-80" />
            <span className="absolute top-24 right-10 w-2.5 h-2.5 rounded-full bg-sky-600 opacity-80" />
            <span className="absolute bottom-20 left-10 w-3 h-3 rounded-full bg-sky-500 opacity-80" />
            <span className="absolute bottom-12 right-12 w-2.5 h-2.5 rounded-full bg-slate-700 opacity-80" />
            <img src={sparkIcon} alt="" className="absolute top-6 left-20 w-6 h-6 object-contain opacity-75" />
            <img src={starIcon} alt="" className="absolute bottom-8 left-24 w-6 h-6 object-contain opacity-75" />

            {/* Floating Merch Showcase Cards */}
            <div className="space-y-3 w-56">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/85 dark:bg-white/5 border border-orange-100 dark:border-white/10 shadow-sm backdrop-blur-xs">
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/60 flex items-center justify-center shrink-0">
                  <img src={merchStoreIcon} alt="" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-[var(--ink)]">Official Merch</span>
                  <span className="block text-[10px] text-slate-400 dark:text-[var(--muted)]">High quality USC gear</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/85 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm backdrop-blur-xs">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200/60 flex items-center justify-center shrink-0">
                  <img src={merchJacketIcon} alt="" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-[var(--ink)]">Varsity &amp; Lanyards</span>
                  <span className="block text-[10px] text-slate-400 dark:text-[var(--muted)]">College pride designs</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/85 dark:bg-white/5 border border-sky-100 dark:border-white/10 shadow-sm backdrop-blur-xs">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200/60 flex items-center justify-center shrink-0">
                  <img src={merchBadgeIcon} alt="" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-[var(--ink)]">Fast Campus Pickup</span>
                  <span className="block text-[10px] text-slate-400 dark:text-[var(--muted)]">USC Office or Delivery</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-1 text-center">
            <span className="block text-xs font-bold text-slate-800 dark:text-[var(--ink)] tracking-tight">Tindahan ni Isko</span>
            <span className="block text-[11px] text-slate-500 dark:text-[var(--muted)] font-medium">Bicol University Student Council</span>
          </div>
        </div>

        {/* BU Campus Pride subtle badges at Top & Bottom */}
        <div className="absolute top-6 left-8 flex items-center gap-3 opacity-70 dark:opacity-40">
          <div className="w-9 h-9 rounded-2xl bg-white/80 dark:bg-white/5 border border-orange-200/60 dark:border-white/10 shadow-2xs flex items-center justify-center text-brand-orange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4.5 h-4.5">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-800 dark:text-[var(--ink)] tracking-tight">Bicol University</span>
          </div>
        </div>

        <div className="absolute bottom-6 left-8 flex items-center gap-2.5 opacity-70 dark:opacity-40">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 dark:bg-white/5 border border-orange-200/60 dark:border-white/10 text-slate-700 dark:text-[var(--muted)] text-xs font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-brand-orange animate-ping" />
            <span>Campus Store Active</span>
          </span>
        </div>

        <div className="absolute top-6 right-8 text-right opacity-70 dark:opacity-40">
          <span className="block text-xs font-bold text-slate-800 dark:text-[var(--ink)]">USC Merchandise Hub</span>
          <span className="block text-[10px] text-slate-400 dark:text-[var(--muted)]">Legazpi City, Albay</span>
        </div>


      </div>

      {/* Standardized Centered Login Card - Identical structure & styling as AdminLogin */}
      <div className="w-full max-w-md mx-auto bg-white dark:bg-[var(--surface)] rounded-3xl shadow-lg p-6 sm:p-7 space-y-3.5 relative z-10 animate-fade-in">
        <div className="space-y-1.5 text-center">
          <div className="inline-flex p-2.5 rounded-2xl bg-gradient-to-b from-orange-50 to-transparent border border-orange-100/60 shadow-2xs mx-auto">
            <img
              src={brandLogo}
              alt="Tindahan ni Isko"
              className="h-11 w-auto object-contain drop-shadow-xs"
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[var(--surface-2)] text-slate-700 dark:text-[var(--ink)] text-[10px] font-bold uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
              <span>Student &amp; Customer Portal</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-[var(--ink)]">Student &amp; Customer Sign In</h1>
            <p className="text-xs text-gray-500 dark:text-[var(--muted)] font-medium mt-0.5 leading-relaxed">
              Access your orders, bag, and favorite products anytime, anywhere.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {phoneField('desktop')}
          {passwordField('desktop')}

          <div className="flex items-center justify-end pt-0.5">
            <Link
              to="/forgot-password?type=customer"
              className="text-xs font-semibold text-brand-orange hover:text-brand-orange-dark hover:underline transition-colors cursor-pointer"
            >
              Forgot password?
            </Link>
          </div>

          {serverError && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs font-medium rounded-xl flex items-center gap-2 animate-slide-up" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{serverError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!formValid || isSubmitting}
            className={`btn btn--lg btn--block rounded-xl font-semibold shadow-xs transition-all ${
              formValid && !isSubmitting
                ? 'btn--primary text-white cursor-pointer btn-press'
                : 'btn--secondary cursor-not-allowed opacity-60'
            }`}
          >
            {isSubmitting ? <AuthenticatingSkeleton /> : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 dark:text-[var(--muted)] font-medium pt-2">
          Don&apos;t have an account?{' '}
          <Link to="/signup/role" className="text-brand-orange font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default SignIn
