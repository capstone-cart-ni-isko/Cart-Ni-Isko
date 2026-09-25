import { Routes, Route, Navigate, useNavigate, Outlet } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './hooks/useAuth.js'
import LoginPromptModal from './components/ui/LoginPromptModal.jsx'
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
import CheckoutPlaceholder from './routes/CheckoutPlaceholder.jsx'
import Appointments from './routes/Appointments.jsx'

// Admin Screen Routes
import AdminLogin from './routes/admin/AdminLogin.jsx'
import RequireAdmin from './components/admin/RequireAdmin.jsx'
import RequireRole from './components/admin/RequireRole.jsx'
import AdminDashboard from './routes/admin/AdminDashboard.jsx'
import AdminPos from './routes/admin/AdminPos.jsx'
import AdminOrders from './routes/admin/AdminOrders.jsx'
import AdminInventory from './routes/admin/AdminInventory.jsx'
import AdminPickup from './routes/admin/AdminPickup.jsx'
import AdminDelivery from './routes/admin/AdminDelivery.jsx'
import AdminAnalytics from './routes/admin/AdminAnalytics.jsx'
import AdminStoreCustomization from './routes/admin/AdminStoreCustomization.jsx'
import AdminSchedule from './routes/admin/AdminSchedule.jsx'
import AdminReviews from './routes/admin/AdminReviews.jsx'
import AdminUsers from './routes/admin/AdminUsers.jsx'
import AdminAppointments from './routes/admin/AdminAppointments.jsx'
import AdminAccount from './routes/admin/AdminAccount.jsx'
import AdminSettings from './routes/admin/AdminSettings.jsx'
import ScrollToTop from './components/layout/ScrollToTop.jsx'

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

function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
        <AdminProvider>
          <CartProvider>
            <WishlistProvider>
              <ScrollToTop />
              <Routes>
                {/* ── Customer Routes ── */}
                <Route path="/" element={<Home />} />
                <Route path="/home" element={<Home />} />
                <Route path="/welcome" element={<Welcome />} />
                <Route path="/signup/*" element={<SignUp />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/verify-otp" element={<VerifyOtp />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/product/:id" element={<ProductDetail />} />

                {/* ── Signed-in account routes ── */}
                <Route element={<RequireAuth />}>
                  <Route path="/wishlist" element={<Wishlist />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<CheckoutPlaceholder />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/orders/:id" element={<OrderDetail />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/account" element={<AccountInfo />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/change-password" element={<ChangePassword />} />
                  <Route path="/settings/address" element={<MyAddress />} />
                  <Route path="/settings/notifications" element={<NotificationPreferences />} />
                  <Route path="/address" element={<MyAddress />} />
                  <Route path="/notifications" element={<Notifications />} />
                </Route>

                {/* ── Admin & Staff Routes ── */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/orders" element={<AdminOrders />} />
                  <Route path="/admin/inventory" element={<AdminInventory />} />
                  {/* /admin/fulfillment → redirect to the new Pickup module */}
                  <Route path="/admin/fulfillment" element={<Navigate to="/admin/pickup" replace />} />
                  <Route path="/admin/pickup" element={<AdminPickup />} />
                  <Route path="/admin/delivery" element={<AdminDelivery />} />
                  <Route path="/admin/analytics" element={<AdminAnalytics />} />
                  <Route path="/admin/customization" element={<AdminStoreCustomization />} />
                  <Route path="/admin/schedule" element={<AdminSchedule />} />
                  <Route path="/admin/appointments" element={<AdminAppointments />} />
                  <Route path="/admin/reviews" element={<AdminReviews />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/admin/account" element={<AdminAccount />} />
                  <Route path="/admin/profile" element={<AdminAccount />} />

                  {/* POS and store settings write through admin-only endpoints */}
                  <Route element={<RequireRole roles={['ADMIN', 'SUPER_ADMIN']} />}>
                    <Route path="/admin/pos" element={<AdminPos />} />
                    <Route path="/admin/settings" element={<AdminSettings />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </WishlistProvider>
          </CartProvider>
        </AdminProvider>
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  )
}

export default App
