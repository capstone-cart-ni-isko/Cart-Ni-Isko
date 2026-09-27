import { useApiLoading } from '../../hooks/useApi.js'

/**
 * Single app-wide progress bar for every backend hop. Mounted once, it gives
 * immediate feedback during the 1-second request window instead of leaving the
 * UI looking frozen.
 */
export default function GlobalApiLoader() {
  const isLoading = useApiLoading()

  return (
    <div
      aria-hidden={!isLoading}
      role="status"
      aria-label="Loading"
      className={`fixed top-0 left-0 right-0 z-[200000] h-0.5 bg-brand-orange transition-opacity duration-200 ${
        isLoading ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="h-full w-1/3 animate-pulse bg-brand-orange-dark" />
    </div>
  )
}
