<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AppointmentsAPI;
use App\Http\Controllers\OrdersAPI;
use App\Http\Controllers\ProductsAPI;
use App\Http\Controllers\SecurityAPI;
use App\Http\Controllers\SystemAPI;
use App\Http\Controllers\UserAPI;

// Public Scheduler Health Route (REQ-AN-03 watchdog, no token required)
Route::get('/health/scheduler', [SystemAPI::class, 'schedulerHealth']);

// DOMAIN 1 - FLOW-SETUP-05 wizard. Public because no account exists yet when
// they matter: /setup/initialize mints the first super admin, so it is
// throttled hard and refuses outright (409) the moment any employee row is
// already there - it can never be used to add a second privileged account.
Route::get('/setup/status', [SystemAPI::class, 'status']);
Route::post('/setup/initialize', [SystemAPI::class, 'initialize'])->middleware('throttle:10,1');

// Public Auth API Routes (no token required, login/signup issue the Sanctum token)
Route::post('/auth/cust_signup', [UserAPI::class, 'customerSignup']);
Route::post('/auth/cust_login', [SecurityAPI::class, 'customerLogin']);
Route::post('/auth/emp_login', [SecurityAPI::class, 'employeeLogin']);
// DOMAIN 2 - realtime field checks for the staff login form. Public because
// nobody owns a session yet, throttled because it answers "does this account
// exist" and "is this the right password" without opening a session. The form
// debounces at 400 ms and re-fires after every pause in typing, so the budget
// has to cover a full minute of ordinary typing (FLOW-EMP_LOGIN-02..08 ask
// for an answer "immediately") without leaving the window where the inline
// messages would go silent.
Route::post('/auth/emp_login/check', [SecurityAPI::class, 'employeeLoginCheck'])->middleware('throttle:180,1');
Route::post('/auth/recover_credentials', [SecurityAPI::class, 'recoverCredentials']);

// DOMAIN 17 / DOMAIN 18 - the phone OTP challenge that gates a signup
// (FLOW-CUST_SIGNUP-05) and a login taken more than fifteen days after the
// last logout (FLOW-CUST_LOGIN-02). They stay outside `auth:api` because
// neither caller owns a session yet: the signed, purpose-scoped challenge in
// the request body is what identifies the account, and it is rejected by
// ApiToken::parse() - so it can never open a protected route.
Route::post('/otp/challenge/start', [SecurityAPI::class, 'startChallenge']);
Route::post('/otp/challenge/verify', [SecurityAPI::class, 'verifyChallenge']);
Route::post('/otp/challenge/inbox', [SecurityAPI::class, 'challengeInbox']);

// Public Products API Routes (guest catalog browsing)
Route::get('/products/filter', [ProductsAPI::class, 'filterCatalog']);
// REQ-ADD_PROD-04: the predefined category set the filters offer.
Route::get('/products/categories', [ProductsAPI::class, 'productCategories']);
Route::get('/products/search', [ProductsAPI::class, 'searchProducts']);
Route::get('/products/sort', [ProductsAPI::class, 'sortProducts']);
Route::get('/products/view', [ProductsAPI::class, 'viewProductDetails']);

// Public Reviews API Routes (guest rating browsing)
Route::get('/reviews/display', [ProductsAPI::class, 'displayReviews']);
Route::get('/reviews/score', [ProductsAPI::class, 'scoreRating']);

// Public PayMongo webhook (REQ-CHECKOUT-03): the gateway calls this without a
// bearer token, so it stays outside `auth:api` and verifies its own signature.
Route::post('/checkout/payment/webhook', [OrdersAPI::class, 'paymentWebhook']);

// Public LalaMove webhook: the courier pushes order/driver status changes here
// (ASSIGNING_DRIVER / ON_GOING / PICKED_UP / COMPLETED / CANCELED). LalaMove
// does not sign its webhooks, so the handler only trusts the LalaMove order id
// and never the payload's status text blindly.
Route::post('/delivery/webhook', [OrdersAPI::class, 'lalamoveWebhook']);

// Everything else requires a Sanctum bearer token
Route::middleware('auth:api')->group(function () {
    Route::post('/auth/logout', [SecurityAPI::class, 'logout']);
    Route::post('/auth/emp_signup', [UserAPI::class, 'employeeSignup'])->middleware('role:super_admin');
    Route::post('/auth/backup_credentials', [UserAPI::class, 'backupCredentials']);
    Route::put('/auth/update_credentials', [UserAPI::class, 'updateCredentials']);

    // DOMAIN 29 - REQ-CUST_SET-02: phone OTP before a sensitive change
    Route::post('/otp/issue', [SecurityAPI::class, 'issue']);
    Route::post('/otp/verify', [SecurityAPI::class, 'verify']);

    // Cart API Routes (DOMAIN 25: customer bag lives in the `bag` table)
    Route::post('/cart/add', [UserAPI::class, 'addOrder']);
    Route::match(['get', 'post'], '/cart/display', [UserAPI::class, 'displayOrders']);
    Route::get('/cart/search', [UserAPI::class, 'searchOrders']);
    Route::get('/cart/sort', [UserAPI::class, 'sortOrders']);
    Route::delete('/cart/remove', [UserAPI::class, 'removeOrder']);
    Route::post('/cart/clear', [UserAPI::class, 'clearCart']);

    // Checkout API Routes (the webhook above is public)
    Route::post('/checkout/dispatch', [OrdersAPI::class, 'determineDispatchDetails']);
    Route::post('/checkout/payment', [OrdersAPI::class, 'integratePayment']);
    Route::post('/checkout/payment/intent', [OrdersAPI::class, 'createPaymentIntent']);
    // The browser is back from PayMongo: the return URL carries the order id
    // and the webhook may still be in flight, so the PWA asks this to settle.
    Route::post('/checkout/payment/status', [OrdersAPI::class, 'paymentStatus']);

    // Courier dispatch (staff): book / cancel the LalaMove order behind a paid
    // delivery. Harmless when LalaMove is unconfigured - it reports that and
    // the manual handover the staff already does keeps working.
    Route::post('/delivery/book', [OrdersAPI::class, 'bookLalamoveDelivery'])->middleware('role:staff');
    Route::post('/delivery/cancel', [OrdersAPI::class, 'cancelLalamoveDelivery'])->middleware('role:staff');

    // Reports API Routes
    Route::middleware('role:staff')->group(function () {
        Route::get('/reports', [SystemAPI::class, 'index']);
        Route::post('/reports', [SystemAPI::class, 'store']);
        Route::get('/reports/{id}', [SystemAPI::class, 'show']);
        Route::put('/reports/{id}', [SystemAPI::class, 'update']);
        Route::delete('/reports/{id}', [SystemAPI::class, 'destroy']);
    });

    // Orders API Routes
    // /orders/add and /orders/remove are the customer cart line endpoints
    // (UserAPI owns them per spec: they operate on bag rows now).
    Route::post('/orders/add', [UserAPI::class, 'updateBagLine']);
    Route::put('/orders/update', [OrdersAPI::class, 'updateOrderDetails']);
    Route::delete('/orders/remove', [UserAPI::class, 'removeOrder']);

    // POS API Routes
    Route::post('/pos/add', [OrdersAPI::class, 'addProductToOrder'])->middleware('role:admin');
    Route::post('/pos/checkout', [OrdersAPI::class, 'checkoutOrder'])->middleware('role:admin');
    Route::put('/pos/update', [OrdersAPI::class,'posUpdateOrderDetails'])->middleware('role:admin');
    Route::delete('/pos/remove', [OrdersAPI::class, 'removeProductFromOrder'])->middleware('role:admin');

    // Notif API Routes
    Route::post('/notif/create', [SystemAPI::class, 'createNotification'])->middleware('role:staff');
    Route::post('/notif/distribute', [SystemAPI::class, 'distributeNotifications'])->middleware('role:staff');
    Route::put('/notif/update', [UserAPI::class, 'updateNotificationStatus']);
    Route::get('/notif/display', [UserAPI::class, 'displayNotifications']);

    // Tracking API Routes
    Route::post('/tracking/create', [OrdersAPI::class, 'createFulfillmentTrack']);
    Route::put('/tracking/update', [OrdersAPI::class, 'updateFulfillmentStatus'])->middleware('role:staff');
    Route::put('/tracking/close', [OrdersAPI::class, 'closeFulfillmentTrack'])->middleware('role:staff');
    Route::post('/tracking/scan', [OrdersAPI::class, 'scanCode']);

    // Access API Routes
    Route::post('/access/flag', [SystemAPI::class, 'flagIrregularity'])->middleware('role:staff');
    Route::post('/access/log', [SystemAPI::class, 'logAction'])->middleware('role:staff');
    // DOMAIN 32 - FLOW-ACCESS_LOG-07: the merged access log is super-admin only
    Route::get('/access/logs', [SystemAPI::class, 'accessLog'])->middleware('role:super_admin');

    // Accounts API Routes
    Route::get('/accounts/me', [UserAPI::class, 'displayMyAccount']);
    Route::put('/accounts/type', [SystemAPI::class, 'changeAccountType'])->middleware('role:super_admin');
    Route::delete('/accounts/delete', [SystemAPI::class, 'deleteAccount'])->middleware('role:super_admin');
    Route::post('/accounts/disable', [SystemAPI::class, 'disableAccount'])->middleware('role:super_admin');
    Route::get('/accounts/display', [SystemAPI::class, 'displayAccounts'])->middleware('role:staff');
    Route::post('/accounts/recover', [SystemAPI::class, 'recoverAccount'])->middleware('role:super_admin');
    Route::get('/accounts/search', [SystemAPI::class, 'searchAccounts'])->middleware('role:staff');
    Route::get('/accounts/sort', [SystemAPI::class, 'sortAccounts'])->middleware('role:staff');
    Route::put('/accounts/update', [UserAPI::class, 'updateAccountDetails']);

    // Appoint API Routes
    Route::post('/appoint/close', [AppointmentsAPI::class, 'closeAppointment'])->middleware('role:admin');
    Route::post('/appoint/create', [AppointmentsAPI::class, 'createAppointment']);
    Route::get('/appoint/display', [AppointmentsAPI::class, 'displayAppointments']);
    Route::get('/appoint/search', [AppointmentsAPI::class, 'searchAppointments']);
    Route::get('/appoint/sort', [AppointmentsAPI::class, 'sortAppointments']);
    Route::get('/appoint/slots', [AppointmentsAPI::class, 'displaySlots']);
    Route::put('/appoint/update', [AppointmentsAPI::class, 'updateAppointmentDetails']);
    // FLOW-MANAGE_APP-09: the admin's reschedule-request queue, and the
    // customer/employee action that opens a request on an open booking.
    Route::get('/appoint/reschedule-requests', [AppointmentsAPI::class, 'rescheduleRequests'])->middleware('role:admin');
    Route::post('/appoint/reschedule-request', [AppointmentsAPI::class, 'createRescheduleRequest']);

    // Uploads API Routes (real file uploads for product / profile photos)
    Route::post('/uploads', [ProductsAPI::class, 'uploadImage']);

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
    Route::post('/reviews/create', [ProductsAPI::class, 'createReview']);
    // Rule 45 / REQ-MANAGE_REV-01: only admins and super admins delete reviews
    // (the customer wall never offers a delete action).
    Route::delete('/reviews/delete', [ProductsAPI::class, 'deleteReview'])->middleware('role:admin');
    Route::post('/reviews/moderate', [ProductsAPI::class, 'moderateReview'])->middleware('role:admin');
    Route::put('/reviews/update', [ProductsAPI::class, 'updateReview']);

    // Settings API Routes
    // DOMAIN 29 - customers read and write their OWN preference columns
    // through these two routes; the controller still restricts system-wide
    // keys to super admins (rule 40) and gates sensitive contacts with OTP.
    Route::get('/settings/display', [UserAPI::class, 'displaySettings']);
    Route::put('/settings/update', [UserAPI::class, 'updateSettings']);

    // Wishlist API Routes
    Route::post('/wishlist/add', [UserAPI::class, 'addWishlistItem']);
    Route::post('/wishlist/to_order', [UserAPI::class, 'addWishlistToOrder']);
    Route::match(['get', 'post'], '/wishlist/display', [UserAPI::class, 'displayWishlist']);
    Route::match(['delete', 'post'], '/wishlist/remove', [UserAPI::class, 'removeWishlistItem']);
    Route::put('/wishlist/update', [UserAPI::class, 'updateWishlistItem']);

    // Duty Shift API Routes (REQ-SS-01 / REQ-SS-02 / REQ-SS-03)
    Route::get('/shifts', [SystemAPI::class, 'displayShifts'])->middleware('role:staff');
    Route::post('/shifts', [SystemAPI::class, 'createShift'])->middleware('role:admin');
    Route::put('/shifts/{shiftId}', [SystemAPI::class, 'updateShift'])->middleware('role:admin');
    Route::delete('/shifts/{shiftId}', [SystemAPI::class, 'cancelShift'])->middleware('role:admin');
});
