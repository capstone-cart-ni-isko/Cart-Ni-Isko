import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { apiRequest, preconnectApi } from '../../services/api.js'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import merchStoreIcon from '../../assets/Branding/Copy of store.png'
import merchShirtIcon from '../../assets/Branding/Copy of shirt.png'
import merchCapIcon from '../../assets/Branding/Copy of cap.png'
import merchJacketIcon from '../../assets/Branding/Copy of jacket.png'
import merchBadgeIcon from '../../assets/Branding/Copy of badge.png'
import sparkIcon from '../../assets/Branding/Copy of sparkle(1).png'
import starIcon from '../../assets/Branding/Copy of star(1).png'
import BackButton from '../../components/ui/BackButton.jsx'
import { empHomePath } from '../../components/admin/schema.js'

/* REQ-EMP_LOGIN-06: whatever is typed stays on screen - the draft lives in
   sessionStorage, which survives in-app navigation and switching back and
   forth between tabs of the same browser session, and is dropped only after
   a successful sign-in. */
const DRAFT_KEY = 'tni_admin_login_draft'

/* REQ-EMP_LOGIN-03: an unmasked password is masked again after three
   seconds. */
const REMASK_MS = 3000

/* FLOW-EMP_LOGIN-02..08: how long the form waits after the last keystroke
   before it asks the server what it thinks of the current inputs. */
const CHECK_DEBOUNCE_MS = 400

function readDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    return { email: draft?.email || '', password: draft?.password || '' }
  } catch {
    return { email: '', password: '' }
  }
}

export default function AdminLogin() {
  const navigate = useNavigate()
  const { loginAdmin, currentAdminUser } = useAdmin()

  const [email, setEmail] = useState(() => readDraft().email)
  const [password, setPassword] = useState(() => readDraft().password)
  const [masked, setMasked] = useState(true)
  // POST /auth/emp_login/check answer: { email_exists, password_correct, ... }
  const [check, setCheck] = useState(null)
  // Messages decided by the last submit, which win over the realtime ones.
  const [submitEmailMsg, setSubmitEmailMsg] = useState(null)
  const [submitPasswordMsg, setSubmitPasswordMsg] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const checkSeq = useRef(0)

  // Already authenticated → skip straight into the portal (staff never land
  // on the Dashboard: REQ-EMP_HOME-01 keeps it out of their portal entirely).
  useEffect(() => {
    if (currentAdminUser) {
      navigate(empHomePath(currentAdminUser), { replace: true })
    }
  }, [currentAdminUser, navigate])

  // REQ-EMP_LOGIN-06: keep the draft of both fields for this browser tab.
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ email, password }))
    } catch {
      // A blocked storage only costs the draft, never the screen.
    }
  }, [email, password])

  // REQ-EMP_LOGIN-03: three seconds of being unmasked, then masked again.
  // Every new unmask restarts the window (REQ-EMP_LOGIN-02).
  useEffect(() => {
    if (masked) return undefined
    const timer = setTimeout(() => setMasked(true), REMASK_MS)
    return () => clearTimeout(timer)
  }, [masked])

  // FLOW-EMP_LOGIN-02..08: ask the server - quietly, so no spinner blinks
  // while the employee types - what it knows about the current pair.
  useEffect(() => {
    const target = email.trim()
    const seq = ++checkSeq.current

    if (!target) {
      setCheck(null)
      return undefined
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest('/auth/emp_login/check', {
          method: 'POST',
          body: { email: target, password },
          silent: true,
        })
        if (seq === checkSeq.current) setCheck(res?.data || null)
      } catch {
        // A throttled or unreachable check simply shows no inline message;
        // the submit below still answers with the authoritative error.
        if (seq === checkSeq.current) setCheck(null)
      }
    }, CHECK_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [email, password])

  const target = email.trim()
  const emailMissing = target.length === 0
  const emailNotFound = !emailMissing && check !== null && !check.email_exists

  // FLOW-EMP_LOGIN-02/03 - below the email field.
  const realtimeEmailMsg = emailNotFound ? 'User not found' : null

  // FLOW-EMP_LOGIN-04..08 - below the password field. Exactly one of the two
  // messages can stand there at a time.
  let realtimePasswordMsg = null
  if (password.length > 0) {
    if (emailMissing || emailNotFound) {
      // FLOW-EMP_LOGIN-04/05: no usable email address behind the password.
      realtimePasswordMsg = 'Provide a valid email'
    } else if (check !== null && check.email_exists && !check.password_correct) {
      // FLOW-EMP_LOGIN-07: the address is real, the password is not.
      realtimePasswordMsg = 'Wrong password'
    }
    // FLOW-EMP_LOGIN-08: a correct password clears the line (null).
  }

  const emailMsg = submitEmailMsg || realtimeEmailMsg
  const passwordMsg = submitPasswordMsg || realtimePasswordMsg
  const clearSubmitMsgs = () => {
    setSubmitEmailMsg(null)
    setSubmitPasswordMsg(null)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!target || !password) {
      setErrorMsg('Please enter your staff email and password.')
      return
    }

    setLoading(true)
    setErrorMsg('')

    // REQ-EMP_LOGIN-04/05: nothing typed is ever cleared, whatever the
    // server answers - the fields keep their values and the inline message
    // is simply moved to the right field.
    const res = await loginAdmin(target, password)
    setLoading(false)

    if (res.success) {
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
      // REQ-EMP_ENROLL-03: a system-generated password must be replaced on
      // first sign-in, so the session starts on the change-password form.
      if (res.user?.mustChangePassword) {
        navigate('/admin/account')
      } else {
        navigate(empHomePath(res.user))
      }
      return
    }

    const code = res.code || ''
    if (code === 'EMP_NOT_FOUND' || res.error === 'User not found') {
      setCheck((prev) => ({ ...(prev || {}), email_exists: false, password_correct: false }))
      setSubmitEmailMsg('User not found')
      setSubmitPasswordMsg(null)
    } else if (code === 'WRONG_PASSWORD' || res.error === 'Wrong password') {
      setCheck((prev) => ({ ...(prev || {}), email_exists: true, password_correct: false }))
      setSubmitEmailMsg(null)
      setSubmitPasswordMsg('Wrong password')
    } else {
      // Account disabled, expired temporary password, throttling, an
      // unreachable server - all of them belong on the banner.
      setErrorMsg(res.error || 'Invalid staff credentials. Access denied.')
    }
  }

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
          {/* Playful Floating Campus Confetti & Icons around the left side */}
          <div className="relative w-72 xl:w-88 h-96 flex items-center justify-center">              {/* Floating Book 1 */}
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
                {/* Waving Student (Left) */}
                <g className="animate-fade-in">
                  {/* Waving Arm */}
                  <path d="M72 105 L30 45" stroke="#FED7AA" strokeWidth="14" strokeLinecap="round" />
                  <circle cx="28" cy="42" r="10" fill="#FED7AA" />
                  {/* Head & Hair */}
                  <circle cx="85" cy="80" r="24" fill="#FED7AA" />
                  <path d="M63 76 Q85 45 107 72 Q100 58 75 62 Z" fill="#0F172A" />
                  {/* Smile */}
                  <path d="M78 86 Q85 94 92 86" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="78" cy="78" r="2.5" fill="#000000" />
                  <circle cx="92" cy="78" r="2.5" fill="#000000" />
                  {/* Orange Polo / Hoodie */}
                  <path d="M60 104 L110 104 L118 180 L52 180 Z" fill="#EA580C" rx="12" />
                  <path d="M60 104 L44 148" stroke="#EA580C" strokeWidth="12" strokeLinecap="round" />
                  {/* Sling Bag Strap */}
                  <line x1="64" y1="104" x2="114" y2="175" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" />
                  <rect x="100" y="160" width="22" height="26" rx="4" fill="#0F172A" />
                  {/* Pants & Shoes */}
                  <rect x="62" y="180" width="18" height="70" rx="6" fill="#334155" />
                  <rect x="88" y="180" width="18" height="70" rx="6" fill="#334155" />
                  <ellipse cx="69" cy="254" rx="12" ry="6" fill="#000000" />
                  <ellipse cx="99" cy="254" rx="12" ry="6" fill="#000000" />
                </g>

                {/* Companion Student with backpack (Right) */}
                <g className="animate-fade-in">
                  {/* Head & Hair */}
                  <circle cx="155" cy="90" r="24" fill="#FED7AA" />
                  <path d="M133 86 Q155 55 177 82 Q170 65 145 70 Z" fill="#0F172A" />
                  {/* Smile & Eyes */}
                  <path d="M148 96 Q155 104 162 96" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="148" cy="88" r="2.5" fill="#000000" />
                  <circle cx="162" cy="88" r="2.5" fill="#000000" />
                  {/* BU Blue Shirt */}
                  <path d="M130 114 L180 114 L186 186 L124 186 Z" fill="#0284C7" rx="12" />
                  {/* Binder in hand */}
                  <rect x="118" y="138" width="18" height="24" rx="2" fill="#0369A1" />
                  {/* Sling / Backpack strap */}
                  <line x1="172" y1="114" x2="134" y2="182" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" />
                  {/* Dark Jeans & Shoes */}
                  <rect x="132" y="186" width="18" height="66" rx="6" fill="#0F172A" />
                  <rect x="158" y="186" width="18" height="66" rx="6" fill="#0F172A" />
                  <ellipse cx="139" cy="256" rx="12" ry="6" fill="#FFFFFF" stroke="#000000" strokeWidth="2" />
                  <ellipse cx="169" cy="256" rx="12" ry="6" fill="#FFFFFF" stroke="#000000" strokeWidth="2" />
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
              <span className="block text-[10px] text-slate-400 dark:text-[var(--muted)] font-medium">Official Student Merch Hub</span>
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

          <div className="absolute bottom-6 right-8 flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-[var(--muted)] opacity-70 dark:opacity-40">
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-sky-600">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              BU-USC Authenticated
            </span>
          </div>
        </div>

        {/* Standardized login card */}
        <div className="w-full max-w-md bg-white dark:bg-[var(--surface)] rounded-3xl p-6 sm:p-7 border border-slate-200/90 dark:border-[var(--line)] shadow-lg space-y-3.5 relative z-10">
          {/* Brand Header */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex p-2.5 rounded-2xl bg-gradient-to-b from-orange-50 to-transparent border border-orange-100/60 shadow-2xs mx-auto">
              <img
                src={brandLogo}
                alt="Tindahan ni Isko"
                className="h-11 w-auto object-contain drop-shadow-xs"
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[var(--surface-2)] border border-slate-200 dark:border-[var(--line)] text-slate-700 dark:text-[var(--ink)] text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse" />
                <span>Staff Portal</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-[var(--ink)]">Staff &amp; Admin Sign In</h1>
              <p className="text-xs text-gray-500 dark:text-[var(--muted)] font-medium mt-0.5 leading-relaxed">
                Authorized Bicol University - USC Access Only
              </p>
            </div>
          </div>

        {/* Error notification (account level, never a field message) */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs font-medium rounded-xl flex items-center gap-2 animate-slide-up" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form - FLOW-EMP_LOGIN-01 */}
        <form onSubmit={handleLogin} className="space-y-4.5" noValidate>
          <div>
            <label htmlFor="emp-email" className="field-label">
              BU Email
            </label>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="emp-email"
                type="text"
                required
                autoComplete="username"
                placeholder="superadmin@bicol-u.edu.ph"
                value={email}
                onFocus={preconnectApi}
                onChange={(e) => {
                  // REQ-EMP_LOGIN-04: the address is kept as typed - only the
                  // message under it reacts.
                  setEmail(e.target.value)
                  clearSubmitMsgs()
                }}
                aria-invalid={emailMsg ? 'true' : undefined}
                className="field-input field-input--lg !pl-10.5 rounded-xl font-medium"
              />
            </div>
            {/* FLOW-EMP_LOGIN-02/03 - "User not found" under the email field */}
            {emailMsg && (
              <p className="field-error" role="alert">
                {emailMsg}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="emp-password" className="field-label">
              Password
            </label>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="emp-password"
                // REQ-EMP_LOGIN-01: masked by default; REQ-EMP_LOGIN-02 lets
                // the employee unmask it as often as they like, and
                // REQ-EMP_LOGIN-03 puts the mask back after three seconds.
                type={masked ? 'password' : 'text'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onFocus={preconnectApi}
                onChange={(e) => {
                  // REQ-EMP_LOGIN-05: the password never disappears, even
                  // when no email is typed.
                  setPassword(e.target.value)
                  clearSubmitMsgs()
                }}
                aria-invalid={passwordMsg ? 'true' : undefined}
                className="field-input field-input--lg !pl-10.5 !pr-11 rounded-xl font-medium"
              />
              <button
                type="button"
                onClick={() => setMasked((current) => !current)}
                aria-label={masked ? 'Unmask password' : 'Mask password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-1"
                tabIndex={-1}
              >
                {masked ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
            {/* FLOW-EMP_LOGIN-04..08 - "Provide a valid email" / "Wrong
                password" under the password field */}
            {passwordMsg && (
              <p className="field-error" role="alert">
                {passwordMsg}
              </p>
            )}
          </div>

          {/* Standardized "Forgot password?" clickable hyperlink */}
          <div className="flex items-center justify-end pt-0.5">
            <Link
              to="/forgot-password?type=employee"
              className="text-xs font-semibold text-brand-orange hover:text-brand-orange-dark hover:underline transition-colors cursor-pointer"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`btn btn--lg btn--block rounded-xl ${
              !loading
                ? 'btn--primary text-white cursor-pointer btn-press'
                : 'btn--secondary cursor-not-allowed opacity-70'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Authenticating…
              </span>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Security disclaimer */}
        <div className="text-center pt-2 border-t border-slate-100 dark:border-[var(--line)]">
          <p className="text-xs text-gray-400 dark:text-[var(--muted)]">
            Protected by Bicol University Student Council IAM System
          </p>
        </div>
      </div>
    </div>
  )
}