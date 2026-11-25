import { useState } from 'react'
import { useToast } from '../../hooks/useToast.js'
import { generateRecoveryCode } from '../../services/auth.js'

/*
  One-time recovery code for the signed-out "Forgot password" flow. The plain
  code is shown once; only its hash is kept on the server, and generating a
  new one replaces the old. The current password is required so a borrowed
  session cannot mint a code and keep the account.
*/
function RecoveryCodeCard({ className = '' }) {
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    const result = await generateRecoveryCode(password)
    setBusy(false)
    if (result.error || !result.code) {
      setError(result.error || 'Could not generate a recovery code.')
      return
    }
    setCode(result.code)
    setPassword('')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      showToast('Recovery code copied.')
    } catch {
      showToast('Copy failed - please write the code down.', 'error')
    }
  }

  return (
    <section
      className={`rounded-2xl border border-slate-200/80 dark:border-[var(--line)] bg-white dark:bg-[var(--surface)] shadow-2xs p-4 md:p-5 space-y-3 ${className}`}
      aria-labelledby="recovery-code-title"
    >
      <div>
        <h2 id="recovery-code-title" className="text-sm font-semibold text-slate-900 dark:text-[var(--ink)]">
          Recovery code
        </h2>
        <p className="text-xs text-slate-500 dark:text-[var(--muted)] mt-0.5">
          If you forget your password, this code lets you reset it. It works once. Generating a new code replaces the old one.
        </p>
      </div>

      {code ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-center">
            <p className="font-mono text-xl font-bold tracking-widest text-slate-900 dark:text-[var(--ink)] select-all">{code}</p>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-2">
              Save it somewhere safe now. It will not be shown again.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy} className="btn btn--secondary flex-1 rounded-xl">
              Copy
            </button>
            <button type="button" onClick={() => setCode('')} className="btn btn--primary flex-1 rounded-xl text-white">
              I saved it
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleGenerate} className="space-y-3" noValidate>
          <div>
            <label htmlFor="recovery-current-password" className="field-label">
              Current password
            </label>
            <input
              id="recovery-current-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError('')
              }}
              className="field-input rounded-xl"
            />
            {error && <p className="field-error mt-1">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={!password || busy}
            className={`btn btn--block rounded-xl ${password && !busy ? 'btn--primary text-white' : 'btn--secondary opacity-70 cursor-not-allowed'}`}
          >
            {busy ? 'Generating…' : 'Generate recovery code'}
          </button>
        </form>
      )}
    </section>
  )
}

export default RecoveryCodeCard
