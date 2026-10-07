import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { apiRequest, preconnectApi } from '../../services/api.js'
import brandLogo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
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
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-gray-100 space-y-7 animate-fade-in">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-1">
            <img
              src={brandLogo}
              alt="Tindahan ni Isko"
              className="h-16 w-auto object-contain"
            />
          </div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">
            Staff &amp; Admin Portal
          </h1>
          <p className="text-xs text-gray-400 font-medium">
            Authorized Bicol University Staff &amp; Officer Access Only
          </p>
        </div>

        {/* Error notification (account level, never a field message) */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2 animate-slide-up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form - FLOW-EMP_LOGIN-01 */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="emp-email" className="block text-xs font-bold text-gray-700 mb-1.5">
              Staff ID / University Email
            </label>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2">
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
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
              />
            </div>
            {/* FLOW-EMP_LOGIN-02/03 - "User not found" under the email field */}
            {emailMsg && (
              <p className="text-[11px] font-semibold text-rose-600 mt-1.5 animate-slide-up" role="alert">
                {emailMsg}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="emp-password" className="block text-xs font-bold text-gray-700 mb-1.5">
              Security Password
            </label>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2">
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
                className="w-full h-11 pl-10 pr-11 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
              />
              <button
                type="button"
                onClick={() => setMasked((current) => !current)}
                aria-label={masked ? 'Unmask password' : 'Mask password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
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
              <p className="text-[11px] font-semibold text-rose-600 mt-1.5 animate-slide-up" role="alert">
                {passwordMsg}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-brand-orange hover:bg-brand-orange-dark text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Staff Console</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Security disclaimer */}
        <div className="text-center pt-1 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">
            Protected by Bicol University Student Council IAM System
          </p>
        </div>
      </div>
    </div>
  )
}
