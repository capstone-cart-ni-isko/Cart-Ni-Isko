import { Routes, Route, Navigate, useNavigate, Outlet } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './hooks/useAuth.js'
import LoginPromptModal from './components/ui/LoginPromptModal.jsx'
import GlobalApiLoader from './components/ui/GlobalApiLoader.jsx'
import { ApiErrorBoundary } from './components/ui/ApiErrorBoundary.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { WishlistProvider } from './context/WishlistContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

import { AdminProvider } from './context/AdminContext.jsx'

import Welcome from './routes/Welcome.jsx'
import SignUp from './routes/SignUp.jsx'
import SignIn from './routes/SignIn.jsx'
import VerifyOtp from './routes/VerifyOtp.jsx'
import ForgotPassword from './routes/ForgotPassword.jsx'
import ResetPassword from './routes/ResetPassword.jsx'
import Home from './routes/Home.jsx'
import Shop from './routes/Shop.jsx'
import ProductDetail from './routes/ProductDetail.jsx'
import Wishlist from './routes/Wishlist.jsx'
import Cart from './routes/Cart.jsx'
import Orders from './routes/Orders.jsx'
import OrderDetail from './routes/OrderDetail.jsx'
import Profile from './routes/Profile.jsx'
import Settings from './routes/Settings.jsx'
import AccountInfo from './routes/AccountInfo.jsx'
import ChangePassword from './routes/ChangePassword.jsx'
import MyAddress from './routes/MyAddress.jsx'
import Notifications from './routes/Notifications.jsx'
import NotificationPreferences from './routes/NotificationPreferences.jsx'
import BackupContacts from './routes/BackupContacts.jsx'
import AboutSettings from './routes/AboutSettings.jsx'
import CheckoutPlaceholder from './routes/CheckoutPlaceholder.jsx'
import Appointments from './routes/Appointments.jsx'
import BookAppointment from './routes/BookAppointment.jsx'

// Admin Screen Routes
import AdminLogin from './routes/admin/AdminLogin.jsx'
import RequireAdmin from './components/admin/RequireAdmin.jsx'
import RequireRole from './components/admin/RequireRole.jsx'
import AdminDashboard from './routes/admin/AdminDashboard.jsx'
import AdminPos from './routes/admin/AdminPos.jsx'
import AdminOrders from './routes/admin/AdminOrders.jsx'
import AdminInventory from './routes/admin/AdminInventory.jsx'
import AdminProductDetail from './routes/admin/AdminProductDetail.jsx'
import AdminPickup from './routes/admin/AdminPickup.jsx'
import AdminDelivery from './routes/admin/AdminDelivery.jsx'
import AdminAnalytics from './routes/admin/AdminAnalytics.jsx'
import AdminStoreCustomization from './routes/admin/AdminStoreCustomization.jsx'
import AdminSchedule from './routes/admin/AdminSchedule.jsx'
import AdminReviews from './routes/admin/AdminReviews.jsx'
import AdminUsers from './routes/admin/AdminUsers.jsx'
import AdminEnroll from './routes/admin/AdminEnroll.jsx'
import AdminAppointments from './routes/admin/AdminAppointments.jsx'
import AdminAccount from './routes/admin/AdminAccount.jsx'
import AdminSettings from './routes/admin/AdminSettings.jsx'
import AdminQr from './routes/admin/AdminQr.jsx'
import AdminNotifications from './routes/admin/AdminNotifications.jsx'
import ScrollToTop from './components/layout/ScrollToTop.jsx'
import { useAdmin } from './hooks/useAdmin.js'
import { empHomePath } from './components/admin/schema.js'
import { latestSessionKind } from './services/session.js'

/**
 * Guards every customer account route. A guest who lands here (deep link or
 * protected link tapped while signed out) gets the sign-in prompt instead of
 * a hard redirect, so "back" still returns to the page they came from.
 */
function RequireAuth() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  if (!currentUser) {
    return <LoginPromptModal isOpen onClose={() => navigate(-1)} />
  }
  return <Outlet />
}

/**
 * FLOW-EMP_HOME-06 - "/" of the employee portal. Each employee is taken to
 * THEIR home page: the Dashboard for admins and super admins, Orders for
 * staff, who may never be shown the Dashboard (REQ-EMP_HOME-01).
 */
function AdminEntryRoute() {
  const { currentAdminUser } = useAdmin()
  return <Navigate to={empHomePath(currentAdminUser)} replace />
}

/**
 * FLOW-CUST_LOGIN-01 - the bare "/" entry rule, read through system rule 71
 * ("the customer portal and the admin portal must be separate").
 *
 * The two portals keep their own session slots, so "/" has to pick one. An
 * employee who still holds a staff session is served the EMPLOYEE portal -
 * sending them to the customer login form would be exactly the cross-portal
 * hop rule 71 forbids. When both slots are signed in, the one signed in last
 * wins (services/session.js: latestSessionKind).
 */
function EntryRoute() {
  const { currentUser } = useAuth()
  const { currentAdminUser } = useAdmin()

  if (currentAdminUser && latestSessionKind() !== 'customer') {
    return <Navigate to="/admin" replace />
  }

  return <Navigate to={currentUser ? '/home' : '/login'} replace />
}

function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
        <AdminProvider>
          <CartProvider>
            <WishlistProvider>
              <ScrollToTop />
              <GlobalApiLoader />
              <ApiErrorBoundary>
                <Routes>
                {/* ── Customer Routes ── */}
                <Route path="/" element={<EntryRoute />} />
                <Route path="/home" element={<Home />} />
                <Route path="/welcome" element={<Welcome />} />
                <Route path="/signup/*" element={<SignUp />} />
                <Route path="/signin" element={<SignIn />} />
                {/* Alias kept for the new-schema spec ("redirects to /login") */}
                <Route path="/login" element={<SignIn />} />
                <Route path="/verify-otp" element={<VerifyOtp />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                {/* New-schema catalog URL: /catalog/[prod_categ]/[prod_tag] */}
                <Route path="/catalog/:categ/:tag" element={<ProductDetail />} />

                {/* Alias for the bag (ribbon destination is /bag; /cart kept) */}
                <Route path="/bag" element={<Cart />} />

                {/* ── Signed-in account routes ── */}
                <Route element={<RequireAuth />}>
                  <Route path="/wishlist" element={<Wishlist />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<CheckoutPlaceholder />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/orders/:id" element={<OrderDetail />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/book" element={<BookAppointment />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/account" element={<AccountInfo />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/change-password" element={<ChangePassword />} />
                  <Route path="/settings/address" element={<MyAddress />} />
                  <Route path="/settings/notifications" element={<NotificationPreferences />} />
                <Route path="/settings/backup" element={<BackupContacts />} />
                <Route path="/settings/about" element={<AboutSettings />} />
                  <Route path="/address" element={<MyAddress />} />
                  <Route path="/notifications" element={<Notifications />} />
                </Route>

                {/* ── Admin & Staff Routes ── */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<AdminEntryRoute />} />
                  {/* REQ-EMP_HOME-01 — the Dashboard must never show to a
                      'staff' employee, so the screen itself carries the role
                      guard rather than only its sidebar entry. */}
                  <Route element={<RequireRole roles={['ADMIN', 'SUPER_ADMIN']} />}>
                    <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  </Route>
                  <Route path="/admin/orders" element={<AdminOrders />} />
                  {/* Rule 41 / REQ-MANAGE_INV-01: inventory is an admin and
                      super-admin surface. The backend already refuses staff on
                      every /products write (role:admin); leaving the route open
                      made the sidebar entry and its screen reachable by a
                      'staff' employee that the spec says never sees Products. */}
                  <Route element={<RequireRole roles={['ADMIN', 'SUPER_ADMIN']} />}>
                    <Route path="/admin/inventory" element={<AdminInventory />} />
                    {/* FLOW-ADD_PROD-01 names the "/admin/add-product" page; it
                        opens the same create form the inventory page hosts. */}
                    <Route path="/admin/add-product" element={<AdminInventory />} />
                    {/* FLOW-MANAGE_INV-05: one product's detail page (variations,
                        prices, stock levels, metrics and its sales history). */}
                    <Route path="/admin/inventory/:prodId" element={<AdminProductDetail />} />
                  </Route>
                  {/* /admin/fulfillment → redirect to the new Pickup module */}
                  <Route path="/admin/fulfillment" element={<Navigate to="/admin/pickup" replace />} />
                  <Route path="/admin/pickup" element={<AdminPickup />} />
                  <Route path="/admin/delivery" element={<AdminDelivery />} />
                  {/* REQ-EMP_HOME-01 — same reasoning as the Dashboard above:
                      "Sales" is never rendered for a 'staff' employee, so the
                      screen behind it carries the guard too rather than only
                      the sidebar entry. */}
                  <Route element={<RequireRole roles={['ADMIN', 'SUPER_ADMIN']} />}>
                    <Route path="/admin/analytics" element={<AdminAnalytics />} />
                  </Route>
                  {/* Rule 40 / FLOW-EMP_SET-06 — store-wide customization is
                      super-admin territory, and SettingsAPI answers 403 to
                      anyone else, so gating the route stops a form whose
                      Save button can never succeed. */}
                  <Route element={<RequireRole roles={['SUPER_ADMIN']} />}>
                    <Route path="/admin/customization" element={<AdminStoreCustomization />} />
                  </Route>
                  {/* FLOW-EMP_SCHED-01 — super admins preschedule from
                      `/admin/schedules`; the singular spelling stays as an
                      alias so existing deep links still land. The screen
                      itself keeps a staff-accessible "my availability" half
                      (FLOW-EMP_SCHED-04), so it is not role-gated here. */}
                  <Route path="/admin/schedules" element={<AdminSchedule />} />
                  <Route path="/admin/schedule" element={<AdminSchedule />} />
                  <Route path="/admin/appointments" element={<AdminAppointments />} />
                  {/* REQ-EMP_HOME-01 — the Reviews entry never renders for a
                      'staff' employee, so the screen behind it is guarded the
                      same way the Dashboard is. */}
                  <Route element={<RequireRole roles={['ADMIN', 'SUPER_ADMIN']} />}>
                    <Route path="/admin/reviews" element={<AdminReviews />} />
                  </Route>
                  {/* REQ-EMP_LIST-01 / REQ-EMP_LIST-05 — the employee directory
                      is super-admin only, and typing the URL must not be a way
                      around the sidebar entry that staff never see. */}
                  <Route element={<RequireRole roles={['SUPER_ADMIN']} />}>
                    <Route path="/admin/users" element={<AdminUsers />} />
                    {/* The staff directory link the sidebar and the enrollment
                        confirmation both point at. */}
                    <Route path="/admin/staff" element={<AdminUsers />} />
                  </Route>
                  <Route path="/admin/account" element={<AdminAccount />} />
                  <Route path="/admin/profile" element={<AdminAccount />} />

                  {/* DOMAIN 3 - FLOW-EMP_HOME-07 / FLOW-EMP_HOME-08: the QR
                      scanner and the notification tab are reachable from the
                      ribbon by every employee (staff included). */}
                  <Route path="/admin/qr" element={<AdminQr />} />
                  <Route path="/admin/notifications" element={<AdminNotifications />} />

                  {/* DOMAIN 15 - FLOW-EMP_SET-01: every employee opens the
                      settings screen through the ribbon's "settings" icon.
                      The store-wide half inside it stays super-admin only,
                      which SettingsAPI enforces for every system key (rule 40). */}
                  <Route path="/admin/settings" element={<AdminSettings />} />

                  {/* POS is walked through by admins and super admins (rule 44).
                      FLOW-EMP_HOME-05 lists "Walk-in Orders" as its own sidebar
                      entry: it is the same register screen under the spec's URL.
                      Without this route the link fell through the "*" rule and
                      dropped the employee into the CUSTOMER portal. */}
                  <Route element={<RequireRole roles={['ADMIN', 'SUPER_ADMIN']} />}>
                    <Route path="/admin/pos" element={<AdminPos />} />
                    <Route path="/admin/walkin" element={<AdminPos />} />
                  </Route>

                  {/* DOMAIN 6 / REQ-EMP_ENROLL-01: enrollment is a super
                      admin only screen, mirroring role:super_admin on
                      POST /auth/emp_signup. */}
                  <Route element={<RequireRole roles={['SUPER_ADMIN']} />}>
                    <Route path="/admin/enroll" element={<AdminEnroll />} />
                  </Route>
                </Route>

                {/* An unknown path must never cross the portal line (rule 71):
                    /admin/anything stays inside the employee portal (and its
                    own guard), everything else is the storefront's 404. */}
                <Route
                  path="/admin/*"
                  element={<Navigate to="/admin" replace />}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ApiErrorBoundary>
            </WishlistProvider>
          </CartProvider>
        </AdminProvider>
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  )
}

export default App
