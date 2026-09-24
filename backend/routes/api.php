<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AccessAPI;
use App\Http\Controllers\AccountsAPI;
use App\Http\Controllers\AppointAPI;
use App\Http\Controllers\AuthAPI;
use App\Http\Controllers\CartAPI;
use App\Http\Controllers\CheckoutAPI;
use App\Http\Controllers\OrdersAPI;
use App\Http\Controllers\PosAPI;
use App\Http\Controllers\NotifAPI;
use App\Http\Controllers\TrackingAPI;
use App\Http\Controllers\ProductsAPI;
use App\Http\Controllers\ReviewsAPI;
use App\Http\Controllers\SettingsAPI;
use App\Http\Controllers\WishlistAPI;

// Public Auth API Routes (no token required, login/signup issue the Sanctum token)
Route::post('/auth/cust_signup', [AuthAPI::class, 'customerSignup']);
Route::post('/auth/cust_login', [AuthAPI::class, 'customerLogin']);
Route::post('/auth/emp_login', [AuthAPI::class, 'employeeLogin']);
Route::post('/auth/recover_credentials', [AuthAPI::class, 'recoverCredentials']);

// Public Products API Routes (guest catalog browsing)
Route::get('/products/filter', [ProductsAPI::class, 'filterCatalog']);
Route::get('/products/search', [ProductsAPI::class, 'searchProducts']);
Route::get('/products/sort', [ProductsAPI::class, 'sortProducts']);
Route::get('/products/view', [ProductsAPI::class, 'viewProductDetails']);

// Public Reviews API Routes (guest rating browsing)
Route::get('/reviews/display', [ReviewsAPI::class, 'displayReviews']);
Route::get('/reviews/score', [ReviewsAPI::class, 'scoreRating']);

// Everything else requires a Sanctum bearer token
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthAPI::class, 'logout']);
    Route::post('/auth/emp_signup', [AuthAPI::class, 'employeeSignup'])->middleware('role:super_admin');
    Route::post('/auth/backup_credentials', [AuthAPI::class, 'backupCredentials']);
    Route::put('/auth/update_credentials', [AuthAPI::class, 'updateCredentials']);

    // Cart API Routes
    Route::post('/cart/add', [CartAPI::class, 'addOrder']);
    Route::get('/cart/display', [CartAPI::class, 'displayOrders']);
    Route::get('/cart/search', [CartAPI::class, 'searchOrders']);
    Route::get('/cart/sort', [CartAPI::class, 'sortOrders']);
    Route::delete('/cart/remove', [CartAPI::class, 'removeOrder']);

    // Checkout API Routes
    Route::post('/checkout/dispatch', [CheckoutAPI::class, 'determineDispatchDetails']);
    Route::post('/checkout/payment', [CheckoutAPI::class, 'integratePayment']);

    // Orders API Routes
    Route::post('/orders/add', [OrdersAPI::class, 'addProductToOrder']);
    Route::put('/orders/update', [OrdersAPI::class, 'updateOrderDetails']);
    Route::delete('/orders/remove', [OrdersAPI::class, 'removeProductFromOrder']);

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

    // Accounts API Routes
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

    // Products API Routes (staff management actions)
    Route::post('/products/add', [ProductsAPI::class, 'addProduct'])->middleware('role:admin');
    Route::get('/products/orders', [ProductsAPI::class, 'displayOrders'])->middleware('role:staff');
    Route::delete('/products/remove', [ProductsAPI::class, 'removeProduct'])->middleware('role:admin');
    Route::put('/products/update', [ProductsAPI::class, 'updateProductDetails'])->middleware('role:admin');
    Route::post('/products/unlist', [ProductsAPI::class, 'unlistProduct'])->middleware('role:admin');
    Route::post('/products/sell', [ProductsAPI::class, 'sellProduct'])->middleware('role:admin');

    // Reviews API Routes (creation/moderation require a token)
    Route::post('/reviews/create', [ReviewsAPI::class, 'createReview']);
    Route::delete('/reviews/delete', [ReviewsAPI::class, 'deleteReview']);
    Route::post('/reviews/moderate', [ReviewsAPI::class, 'moderateReview'])->middleware('role:admin');
    Route::put('/reviews/update', [ReviewsAPI::class, 'updateReview']);

    // Settings API Routes
    Route::get('/settings/display', [SettingsAPI::class, 'displaySettings'])->middleware('role:staff');
    Route::put('/settings/update', [SettingsAPI::class, 'updateSettings'])->middleware('role:admin');

    // Wishlist API Routes
    Route::post('/wishlist/add', [WishlistAPI::class, 'addWishlistItem']);
    Route::post('/wishlist/to_order', [WishlistAPI::class, 'addWishlistToOrder']);
    Route::match(['get', 'post'], '/wishlist/display', [WishlistAPI::class, 'displayWishlist']);
    Route::match(['delete', 'post'], '/wishlist/remove', [WishlistAPI::class, 'removeWishlistItem']);
    Route::put('/wishlist/update', [WishlistAPI::class, 'updateWishlistItem']);
});
