/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * RULE 71 — the two portals keep their own theme preference.
 *
 * One shared key meant that signing into the staff portal re-painted the
 * storefront with whatever the employee happened to prefer: the choice
 * followed the browser instead of the portal. Each side owns a key.
 *
 * The preference is held as a per-portal map rather than a single value
 * plus a "portal changed" effect. That matters: with one value, crossing
 * from /home into /admin carries the old theme into the new portal's
 * effect first, so the incoming key gets stamped with the outgoing
 * portal's choice and then reads it straight back — the two would never
 * separate. Deriving `dark` from `map[portal]` makes that crossover
 * impossible by construction.
 *
 * `isko_theme` is the pre-split key; it seeds whichever portal opens
 * first so nobody loses the preference they had already set.
 */
export const THEME_KEYS = { customer: 'isko_theme_customer', staff: 'isko_theme_staff' }
const LEGACY_KEY = 'isko_theme'

const ThemeContext = createContext(null)

/** The staff portal owns every path under `/admin`. */
export function themePortal(pathname = window.location.pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'staff' : 'customer'
}

function storedTheme(portal) {
  const own = localStorage.getItem(THEME_KEYS[portal])
  if (own === 'dark' || own === 'light') return own
  return localStorage.getItem(LEGACY_KEY) === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const location = useLocation()
  const portal = themePortal(location.pathname)

  // Read once per mount: applying the stored preference before the first
  // paint is what stops a light flash (FLOW-EMP_SET-05).
  const [themes, setThemes] = useState(() => ({
    customer: storedTheme('customer') === 'dark',
    staff: storedTheme('staff') === 'dark',
  }))

  const dark = themes[portal]

  /*
   * Applying the theme and filing the choice are the same effect, so what is
   * on screen can never disagree with what is stored. `dark` here is derived
   * from the active portal, so walking from the storefront into /admin swaps
   * to that portal's preference without ever writing the other one's value.
   */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(THEME_KEYS[portal], dark ? 'dark' : 'light')
  }, [dark, portal])

  /*
   * `set` depends only on `portal`, never on `dark`. AdminTopBar re-hydrates
   * `emp_darkmode` in an effect keyed on this function, so an identity that
   * moved with the theme would invalidate that effect after one click and
   * hand back the value the employee had just changed. The updater form
   * reads the current value from inside `setThemes`, which keeps it stable.
   *
   * `next` may be a boolean or an updater, matching useState's contract.
   */
  const set = useCallback(
    (next) => {
      setThemes((prev) => {
        const current = prev[portal]
        const value = typeof next === 'function' ? next(current) : Boolean(next)
        return current === value ? prev : { ...prev, [portal]: value }
      })
    },
    [portal]
  )

  const value = useMemo(
    () => ({
      dark,
      portal,
      set,
      // FLOW-EMP_HOME-09/10 + FLOW-EMP_SET-05: the ribbon flips the theme
      // and the account stores the preference (see AdminTopBar).
      toggle: () => set((prev) => !prev),
    }),
    [dark, portal, set]
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
