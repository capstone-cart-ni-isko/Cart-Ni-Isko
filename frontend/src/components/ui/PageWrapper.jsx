/**
 * A consistent page wrapper with max-width and padding.
 * Use this as the top-level container for all pages in both portals.
 */
export default function PageWrapper({ children, className = '' }) {
  return (
    <div className={`px-4 py-6 pb-32 md:px-6 lg:px-8 lg:pb-16 max-w-7xl mx-auto animate-fade-in ${className}`}>
      {children}
    </div>
  )
}
