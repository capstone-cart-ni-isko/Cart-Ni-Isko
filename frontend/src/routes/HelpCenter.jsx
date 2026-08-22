import { useState } from 'react'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { helpCategories } from '../data/mockUser.js'
import searchIcon from '../assets/icons/common/search.svg'

function HelpCenter() {
  const [query, setQuery] = useState('')

  const filtered = helpCategories.filter((cat) =>
    cat.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <AppShell>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-3xl mx-auto">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">Help Center</h1>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Help Center" backTo="/profile" />
        </div>

        <div className="space-y-6">
          {/* Search */}
          <div className="relative">
            <img src={searchIcon} alt="" className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
            <input
              type="search"
              placeholder="Search for help..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-4 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all bg-white"
            />
          </div>

          {/* Categories list */}
          <div className="space-y-3">
            {filtered.map((category) => (
              <button
                key={category}
                type="button"
                className="w-full bg-white rounded-xl px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 active:scale-99 transition-all border border-gray-200 shadow-sm cursor-pointer"
              >
                <span className="text-sm font-semibold text-gray-800">{category}</span>
                <span className="text-gray-400 text-lg">›</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8 font-medium">No results found for "{query}"</p>
            )}
          </div>

          {/* Support block */}
          <div className="bg-brand-orange/5 rounded-2xl p-6 text-center border border-brand-orange/10 space-y-3">
            <p className="text-sm text-gray-600 font-semibold">Still need help?</p>
            <p className="text-xs text-gray-400 max-w-[200px] mx-auto leading-relaxed">
              Our support team is available Mon-Fri, 8AM-5PM to assist you.
            </p>
            <button
              type="button"
              className="bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold px-5 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default HelpCenter

