import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { StoreIcon, UsersGroupIcon, RefreshCwIcon } from '../components/ui/Icons.jsx'

/*
    DOMAIN 29 - FLOW-CUST_SET-10: "/settings/about" is the one tab that shows
    the store information, the developers behind the app, and the version
    history. Nothing here is fetched: the shop's own record is static text.
*/

const STORE = {
  name: 'Tindahan ni Isko',
  tagline: 'The campus sari-sari store, online.',
  address: 'Nueva Ecija State University, Cabanatuan City, Nueva Ecija',
  hours: 'Monday to Saturday, 8:00 AM - 6:00 PM',
  email: 'tindahan.ni.isko@nesu.edu.ph',
  phone: '+63 900 000 0000',
}

const DEVELOPERS = [
  { name: 'John Marvin Marfil', role: 'Full-stack developer' },
  { name: 'Kristel Ann B. Ebuenga', role: 'Full-stack developer' },
  { name: 'Austin Doki', role: 'Full-stack developer' },
]

const VERSIONS = [
  {
    version: '1.2.0',
    date: 'October 2026',
    notes: [
      'Customer settings: OTP-verified password and backup contact changes',
      'Notification preferences saved straight to your account',
      'Multiple saved delivery addresses',
    ],
  },
  {
    version: '1.1.0',
    date: 'September 2026',
    notes: [
      'Appointments, order tracking and the in-app notification inbox',
      'Wishlist, bag and checkout flow',
    ],
  },
  {
    version: '1.0.0',
    date: 'August 2026',
    notes: ['First public release of the Tindahan ni Isko storefront'],
  },
]

function Card({ icon, title, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <span className="shrink-0">{icon}</span>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  )
}

function AboutSettings() {
  return (
    <AccountLayout>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in w-full">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">About</h1>
          <p className="text-sm text-gray-400 mt-1">
            Store information, the people who built it, and what changed.
          </p>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="About" backTo="/settings" />
        </div>

        <div className="space-y-5">
          <Card icon={<StoreIcon className="w-4 h-4 text-brand-orange" />} title="Store information">
            <p className="text-lg font-black text-gray-900">{STORE.name}</p>
            <p className="text-xs font-semibold text-brand-orange uppercase tracking-wider mt-0.5">
              {STORE.tagline}
            </p>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div>
                <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">Address</dt>
                <dd className="text-gray-700 font-medium">{STORE.address}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">Hours</dt>
                <dd className="text-gray-700 font-medium">{STORE.hours}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email</dt>
                <dd className="text-gray-700 font-medium">{STORE.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">Phone</dt>
                <dd className="text-gray-700 font-medium">{STORE.phone}</dd>
              </div>
            </dl>
          </Card>

          <Card icon={<UsersGroupIcon className="w-4 h-4 text-brand-orange" />} title="Developers">
            <ul className="space-y-3">
              {DEVELOPERS.map((dev) => (
                <li key={dev.name} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{dev.name}</p>
                    <p className="text-xs text-gray-400">{dev.role}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-gray-400">
              Built as a capstone project: a Laravel REST API with a Supabase PostgreSQL database,
              consumed by this React storefront.
            </p>
          </Card>

          <Card
            icon={<RefreshCwIcon className="w-4 h-4 text-brand-orange" />}
            title="Version history"
          >
            <ol className="space-y-4">
              {VERSIONS.map((entry) => (
                <li key={entry.version} className="border-l-2 border-brand-orange/40 pl-3.5">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-black text-gray-900">v{entry.version}</p>
                    <p className="text-xs font-semibold text-gray-400">{entry.date}</p>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {entry.notes.map((note) => (
                      <li key={note} className="text-xs leading-relaxed text-gray-500">
                        • {note}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </AccountLayout>
  )
}

export default AboutSettings
