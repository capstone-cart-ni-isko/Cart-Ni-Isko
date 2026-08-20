import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { WishlistProvider } from './context/WishlistContext.jsx'

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
import Security from './routes/Security.jsx'
import ChangePassword from './routes/ChangePassword.jsx'
import MyAddress from './routes/MyAddress.jsx'
import Notifications from './routes/Notifications.jsx' // Notification panel/bell inbox
import NotificationPreferences from './routes/NotificationPreferences.jsx' // Notification toggle settings
import CheckoutPlaceholder from './routes/CheckoutPlaceholder.jsx'
import HelpCenter from './routes/HelpCenter.jsx'

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <Routes>
              <Route path="/" element={<Welcome />} />
              <Route path="/signup/*" element={<SignUp />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/verify-otp" element={<VerifyOtp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/home" element={<Home />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/account" element={<AccountInfo />} />
              <Route path="/security" element={<Security />} />
              <Route path="/settings/change-password" element={<ChangePassword />} />
              <Route path="/settings/address" element={<MyAddress />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings/notifications" element={<NotificationPreferences />} />
              <Route path="/checkout" element={<CheckoutPlaceholder />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
