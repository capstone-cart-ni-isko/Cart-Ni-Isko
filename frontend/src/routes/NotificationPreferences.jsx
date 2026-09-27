import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'

/*
    Notification delivery is not a stored preference: every notification the
    shop sends is required by the SRS, so there is nothing to switch on or off
    here. Unread state and the automated follow-up for priority notifications
    both live on the Notifications page (REQ-AN-01, REQ-AN-02, REQ-AN-03).
*/
function NotificationPreferences() {
  return (
    <AccountLayout>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in w-full">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">Notification Preferences</h1>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Notification Preferences" backTo="/settings" />
        </div>

        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-6">
          <h2 className="text-sm font-bold text-gray-900">All notifications are always on</h2>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            The SRS requires the shop to tell you about every change to your orders and
            appointments, and to follow up on any priority notification you have not read
            yet. There is nothing to configure.
          </p>
          <a
            to="/notifications"
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-orange"
          >
            Go to your notifications <span className="text-lg leading-none">›</span>
          </a>
        </section>
      </div>
    </AccountLayout>
  )
}

export default NotificationPreferences
