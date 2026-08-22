import { useState } from 'react'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { SparklesIcon, PackageIcon, CheckIcon, ShirtIcon, StarIcon, BellIcon } from '../components/ui/Icons.jsx'

function NotifIcon({ type, className }) {
  switch (type) {
    case 'welcome': return <SparklesIcon className={className} />
    case 'order': return <PackageIcon className={className} />
    case 'pickup': return <CheckIcon className={className} />
    case 'arrival': return <ShirtIcon className={className} />
    case 'review': return <StarIcon className={className} />
    default: return <BellIcon className={className} />
  }
}

const mockNotifications = [
  {
    id: 1,
    type: 'welcome',
    title: 'Welcome to Tindahan ni Isko!',
    message: 'Your account is ready. Start browsing BU campus merch and show your Iskolar pride.',
    time: '1h ago',
    read: false,
  },
  {
    id: 2,
    type: 'order',
    title: 'Order Confirmed',
    message: 'Your order ORD-2026-001 for BUnique College Hoodie has been confirmed and is being processed.',
    time: '3h ago',
    read: false,
  },
  {
    id: 3,
    type: 'pickup',
    title: 'Ready for Pick-up',
    message: 'Your Isko Tote Bag is ready! Visit the Main Campus store Mon–Fri, 8AM–5PM.',
    time: '1d ago',
    read: true,
  },
  {
    id: 4,
    type: 'arrival',
    title: 'New Arrivals: BUnique Collection',
    message: "The limited BUnique Collection is now available for pre-order. Don't miss out!",
    time: '2d ago',
    read: true,
  },
  {
    id: 5,
    type: 'review',
    title: 'Rate Your Order',
    message: 'How was the BU Lanyard Set? Share your feedback to help other Iskos.',
    time: '5d ago',
    read: true,
  },
]

function Notifications() {
  const [items, setItems] = useState(mockNotifications)

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const markRead = (id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const unreadCount = items.filter((n) => !n.read).length

  return (
    <AppShell>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-4xl mx-auto">
        {/* Desktop Header Title */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-450 font-semibold mt-1">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-sm font-bold text-brand-orange hover:underline transition-colors cursor-pointer"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Mobile Header Title */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white sticky top-0 z-20 lg:hidden -mx-4 -mt-4 mb-4">
          <div>
            <h1 className="text-lg font-extrabold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-gray-400 font-semibold mt-0.5">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-bold text-brand-orange hover:underline transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="pb-12">
          {items.length === 0 ? (
            <div className="text-center py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 mb-2">
                <BellIcon className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="font-bold text-gray-700">No notifications yet</h3>
              <p className="text-sm text-gray-450 mt-2">We'll let you know when something happens.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {items.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => markRead(notif.id)}
                  className={`w-full text-left flex items-start gap-4 px-5 py-4 transition-colors hover:bg-gray-50 cursor-pointer ${
                    !notif.read ? 'bg-brand-orange/[0.02] border-l-2 border-brand-orange' : ''
                  }`}
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                    !notif.read ? 'bg-brand-orange/10' : 'bg-gray-50'
                  }`}>
                    <NotifIcon type={notif.type} className={`w-5 h-5 ${!notif.read ? 'text-brand-orange' : 'text-gray-450'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm leading-tight ${!notif.read ? 'font-extrabold text-gray-900' : 'font-bold text-gray-700'}`}>
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-brand-orange shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-gray-400 font-semibold mt-1.5">{notif.time}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

export default Notifications
