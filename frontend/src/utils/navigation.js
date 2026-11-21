/**
 * True when an earlier page of THIS app sits behind the current one in the
 * tab's history, so navigate(-1) stays inside the site.
 *
 * window.history.length also counts pages from other sites (for example the
 * PayMongo checkout the customer just returned from), so a back button built
 * on it sends people off the site. React Router numbers its own entries in
 * history.state.idx, starting at 0 for the page the tab first loaded.
 */
export function canGoBackInApp() {
  if (typeof window === 'undefined') return false
  const idx = window.history.state?.idx
  return typeof idx === 'number' && idx > 0
}
