<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AccessAPI;
use App\Http\Controllers\AccountsAPI;
use App\Http\Controllers\AppointAPI;
use App\Http\Controllers\AuthAPI;
use App\Http\Controllers\CartAPI;
use App\Http\Controllers\CheckoutAPI;
use App\Http\Controllers\HealthAPI;
use App\Http\Controllers\OrdersAPI;
use App\Http\Controllers\PosAPI;
use App\Http\Controllers\NotifAPI;
use App\Http\Controllers\OtpAPI;
use App\Http\Controllers\ReportsAPI;
use App\Http\Controllers\ShiftAPI;
use App\Http\Controllers\TrackingAPI;
use App\Http\Controllers\ProductsAPI;
use App\Http\Controllers\ReviewsAPI;
use App\Http\Controllers\SettingsAPI;
use App\Http\Controllers\SetupAPI;
use App\Http\Controllers\WishlistAPI;
use App\Http\Controllers\UploadAPI;

// Public Scheduler Health Route (REQ-AN-03 watchdog, no token required)
Route::get('/health/scheduler', [HealthAPI::class, 'schedulerHealth']);

// DOMAIN 1 - FLOW-SETUP-05 wizard. Public because no account exists yet when
// they matter: /setup/initialize mints the first super admin, so it is
// throttled hard and refuses outright (409) the moment any employee row is
// already there - it can never be used to add a second privileged account.
Route::get('/setup/status', [SetupAPI::class, 'status']);
Route::post('/setup/initialize', [SetupAPI::class, 'initialize'])->middleware('throttle:10,1');

// Public Auth API Routes (no token required, login/signup issue the Sanctum token)
Route::post('/auth/cust_signup', [AuthAPI::class, 'customerSignup']);
Route::post('/auth/cust_login', [AuthAPI::class, 'customerLogin']);
Route::post('/auth/emp_login', [AuthAPI::class, 'employeeLogin']);
// DOMAIN 2 - realtime field checks for the staff login form. Public because
// nobody owns a session yet, throttled because it answers "does this account
// exist" and "is this the right password" without opening a session. The form
// debounces at 400 ms and re-fires after every pause in typing, so the budget
// has to cover a full minute of ordinary typing (FLOW-EMP_LOGIN-02..08 ask
// for an answer "immediately") without leaving the window where the inline
// messages would go silent.
Route::post('/auth/emp_login/check', [AuthAPI::class, 'employeeLoginCheck'])->middleware('throttle:180,1');
Route::post('/auth/recover_credentials', [AuthAPI::class, 'recoverCredentials']);

// DOMAIN 17 / DOMAIN 18 - the phone OTP challenge that gates a signup
// (FLOW-CUST_SIGNUP-05) and a login taken more than fifteen days after the
// last logout (FLOW-CUST_LOGIN-02). They stay outside `auth:api` because
// neither caller owns a session yet: the signed, purpose-scoped challenge in
// the request body is what identifies the account, and it is rejected by
// ApiToken::parse() - so it can never open a protected route.
Route::post('/otp/challenge/start', [OtpAPI::class, 'startChallenge']);
Route::post('/otp/challenge/verify', [OtpAPI::class, 'verifyChallenge']);
Route::post('/otp/challenge/inbox', [OtpAPI::class, 'challengeInbox']);

// Public Products API Routes (guest catalog browsing)
Route::get('/products/filter', [ProductsAPI::class, 'filterCatalog']);
// REQ-ADD_PROD-04: the predefined category set the filters offer.
Route::get('/products/categories', [ProductsAPI::class, 'productCategories']);
Route::get('/products/search', [ProductsAPI::class, 'searchProducts']);
Route::get('/products/sort', [ProductsAPI::class, 'sortProducts']);
Route::get('/products/view', [ProductsAPI::class, 'viewProductDetails']);

// Public Reviews API Routes (guest rating browsing)
Route::get('/reviews/display', [ReviewsAPI::class, 'displayReviews']);
Route::get('/reviews/score', [ReviewsAPI::class, 'scoreRating']);

// Public PayMongo webhook (REQ-CHECKOUT-03): the gateway calls this without a
// bearer token, so it stays outside `auth:api` and verifies its own signature.
Route::post('/checkout/payment/webhook', [CheckoutAPI::class, 'paymentWebhook']);

// Everything else requires a Sanctum bearer token
Route::middleware('auth:api')->group(function () {
    Route::post('/auth/logout', [AuthAPI::class, 'logout']);
    Route::post('/auth/emp_signup', [AuthAPI::class, 'employeeSignup'])->middleware('role:super_admin');
    Route::post('/auth/backup_credentials', [AuthAPI::class, 'backupCredentials']);
    Route::put('/auth/update_credentials', [AuthAPI::class, 'updateCredentials']);

    // DOMAIN 29 - REQ-CUST_SET-02: phone OTP before a sensitive change
    Route::post('/otp/issue', [OtpAPI::class, 'issue']);
    Route::post('/otp/verify', [OtpAPI::class, 'verify']);

    // Cart API Routes (DOMAIN 25: customer bag lives in the `bag` table)
    Route::post('/cart/add', [CartAPI::class, 'addOrder']);
    Route::match(['get', 'post'], '/cart/display', [CartAPI::class, 'displayOrders']);
    Route::get('/cart/search', [CartAPI::class, 'searchOrders']);
    Route::get('/cart/sort', [CartAPI::class, 'sortOrders']);
    Route::delete('/cart/remove', [CartAPI::class, 'removeOrder']);
    Route::post('/cart/clear', [CartAPI::class, 'clearCart']);

    // Checkout API Routes (the webhook above is public)
    Route::post('/checkout/dispatch', [CheckoutAPI::class, 'determineDispatchDetails']);
    Route::post('/checkout/payment', [CheckoutAPI::class, 'integratePayment']);
    Route::post('/checkout/payment/intent', [CheckoutAPI::class, 'createPaymentIntent']);

    // Reports API Routes
    Route::middleware('role:staff')->group(function () {
        Route::get('/reports', [ReportsAPI::class, 'index']);
        Route::post('/reports', [ReportsAPI::class, 'store']);
        Route::get('/reports/{id}', [ReportsAPI::class, 'show']);
        Route::put('/reports/{id}', [ReportsAPI::class, 'update']);
        Route::delete('/reports/{id}', [ReportsAPI::class, 'destroy']);
    });

    // Orders API Routes
    // /orders/add and /orders/remove are the customer cart line endpoints
    // (CartAPI owns them per spec: they operate on bag rows now).
    Route::post('/orders/add', [CartAPI::class, 'updateBagLine']);
    Route::put('/orders/update', [OrdersAPI::class, 'updateOrderDetails']);
    Route::delete('/orders/remove', [CartAPI::class, 'removeOrder']);

    // POS API Routes
    Route::post('/pos/add', [PosAPI::class, 'addProductToOrder'])->middleware('role:admin');
    Route::post('/pos/checkout', [PosAPI::class, 'checkoutOrder'])->middleware('role:admin');
    Route::put('/pos/update', [PosAPI::class, 'updateOrderDetails'])->middleware('role:admin');
    Route::delete('/pos/remove', [PosAPI::class, 'removeProductFromOrder'])->middleware('role:admin');

    // Notif API Routes
    Route::post('/notif/create', [NotifAPI::class, 'createNotification'])->middleware('role:staff');
    Route::post('/notif/distribute', [NotifAPI::class, 'distributeNotifications'])->middleware('role:staff');
    Route::put('/notif/update', [NotifAPI::class, 'updateNotificationStatus']);
    Route::get('/notif/display', [NotifAPI::class, 'displayNotifications']);

    // Tracking API Routes
    Route::post('/tracking/create', [TrackingAPI::class, 'createFulfillmentTrack']);
    Route::put('/tracking/update', [TrackingAPI::class, 'updateFulfillmentStatus'])->middleware('role:staff');
    Route::put('/tracking/close', [TrackingAPI::class, 'closeFulfillmentTrack'])->middleware('role:staff');
    Route::post('/tracking/scan', [TrackingAPI::class, 'scanCode']);

    // Access API Routes
    Route::post('/access/flag', [AccessAPI::class, 'flagIrregularity'])->middleware('role:staff');
    Route::post('/access/log', [AccessAPI::class, 'logAction'])->middleware('role:staff');
    // DOMAIN 32 - FLOW-ACCESS_LOG-07: the merged access log is super-admin only
    Route::get('/access/logs', [AccessAPI::class, 'accessLog'])->middleware('role:super_admin');

    // Accounts API Routes
    Route::get('/accounts/me', [AccountsAPI::class, 'displayMyAccount']);
    Route::put('/accounts/type', [AccountsAPI::class, 'changeAccountType'])->middleware('role:super_admin');
    Route::delete('/accounts/delete', [AccountsAPI::class, 'deleteAccount'])->middleware('role:super_admin');
    Route::post('/accounts/disable', [AccountsAPI::class, 'disableAccount'])->middleware('role:super_admin');
    Route::get('/accounts/display', [AccountsAPI::class, 'displayAccounts'])->middleware('role:staff');
    Route::post('/accounts/recover', [AccountsAPI::class, 'recoverAccount'])->middleware('role:super_admin');
    Route::get('/accounts/search', [AccountsAPI::class, 'searchAccounts'])->middleware('role:staff');
    Route::get('/accounts/sort', [AccountsAPI::class, 'sortAccounts'])->middleware('role:staff');
    Route::put('/accounts/update', [AccountsAPI::class, 'updateAccountDetails']);

    // Appoint API Routes
    Route::post('/appoint/close', [AppointAPI::class, 'closeAppointment'])->middleware('role:admin');
    Route::post('/appoint/create', [AppointAPI::class, 'createAppointment']);
    Route::get('/appoint/display', [AppointAPI::class, 'displayAppointments']);
    Route::get('/appoint/search', [AppointAPI::class, 'searchAppointments']);
    Route::get('/appoint/sort', [AppointAPI::class, 'sortAppointments']);
    Route::get('/appoint/slots', [AppointAPI::class, 'displaySlots']);
    Route::put('/appoint/update', [AppointAPI::class, 'updateAppointmentDetails']);
    // FLOW-MANAGE_APP-09: the admin's reschedule-request queue, and the
    // customer/employee action that opens a request on an open booking.
    Route::get('/appoint/reschedule-requests', [AppointAPI::class, 'rescheduleRequests'])->middleware('role:admin');
    Route::post('/appoint/reschedule-request', [AppointAPI::class, 'createRescheduleRequest']);

    // Uploads API Routes (real file uploads for product / profile photos)
    Route::post('/uploads', [UploadAPI::class, 'uploadImage']);

    // Products API Routes (staff management actions)
    Route::post('/products/add', [ProductsAPI::class, 'addProduct'])->middleware('role:admin');
    // FLOW-MANAGE_INV-08: per-product daily sales history (admin only).
    Route::get('/products/sales', [ProductsAPI::class, 'productSales'])->middleware('role:admin');
    Route::get('/products/orders', [ProductsAPI::class, 'displayOrders'])->middleware('role:staff');
    Route::delete('/products/remove', [ProductsAPI::class, 'removeProduct'])->middleware('role:admin');
    Route::put('/products/update', [ProductsAPI::class, 'updateProductDetails'])->middleware('role:admin');
    Route::post('/products/unlist', [ProductsAPI::class, 'unlistProduct'])->middleware('role:admin');
    Route::post('/products/sell', [ProductsAPI::class, 'sellProduct'])->middleware('role:admin');

    // Reviews API Routes (creation/moderation require a token)
    Route::post('/reviews/create', [ReviewsAPI::class, 'createReview']);
    // Rule 45 / REQ-MANAGE_REV-01: only admins and super admins delete reviews
    // (the customer wall never offers a delete action).
    Route::delete('/reviews/delete', [ReviewsAPI::class, 'deleteReview'])->middleware('role:admin');
    Route::post('/reviews/moderate', [ReviewsAPI::class, 'moderateReview'])->middleware('role:admin');
    Route::put('/reviews/update', [ReviewsAPI::class, 'updateReview']);

    // Settings API Routes
    // DOMAIN 29 - customers read and write their OWN preference columns
    // through these two routes; the controller still restricts system-wide
    // keys to super admins (rule 40) and gates sensitive contacts with OTP.
    Route::get('/settings/display', [SettingsAPI::class, 'displaySettings']);
    Route::put('/settings/update', [SettingsAPI::class, 'updateSettings']);

    // Wishlist API Routes
    Route::post('/wishlist/add', [WishlistAPI::class, 'addWishlistItem']);
    Route::post('/wishlist/to_order', [WishlistAPI::class, 'addWishlistToOrder']);
    Route::match(['get', 'post'], '/wishlist/display', [WishlistAPI::class, 'displayWishlist']);
    Route::match(['delete', 'post'], '/wishlist/remove', [WishlistAPI::class, 'removeWishlistItem']);
    Route::put('/wishlist/update', [WishlistAPI::class, 'updateWishlistItem']);

    // Duty Shift API Routes (REQ-SS-01 / REQ-SS-02 / REQ-SS-03)
    Route::get('/shifts', [ShiftAPI::class, 'displayShifts'])->middleware('role:staff');
    Route::post('/shifts', [ShiftAPI::class, 'createShift'])->middleware('role:admin');
    Route::put('/shifts/{shiftId}', [ShiftAPI::class, 'updateShift'])->middleware('role:admin');
    Route::delete('/shifts/{shiftId}', [ShiftAPI::class, 'cancelShift'])->middleware('role:admin');
});
