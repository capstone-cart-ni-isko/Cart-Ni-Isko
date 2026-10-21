<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AppointmentsAPI;
use App\Http\Controllers\OrdersAPI;
use App\Http\Controllers\ProductsAPI;
use App\Http\Controllers\SecurityAPI;
use App\Http\Controllers\SystemAPI;
use App\Http\Controllers\UserAPI;
Route::get('/health/scheduler', [SystemAPI::class, 'schedulerHealth']);
Route::get('/setup/status', [SystemAPI::class, 'status']);
Route::post('/setup/initialize', [SystemAPI::class, 'initialize'])->middleware('throttle:10,1');
Route::post('/auth/cust_signup', [SecurityAPI::class, 'customerSignup']);
Route::post('/auth/cust_login', [SecurityAPI::class, 'customerLogin']);
Route::post('/auth/emp_login', [SecurityAPI::class, 'employeeLogin']);
Route::post('/auth/emp_login/check', [SecurityAPI::class, 'employeeLoginCheck'])->middleware('throttle:180,1');
Route::post('/auth/recover_credentials', [SecurityAPI::class, 'recoverCredentials']);
Route::post('/otp/challenge/start', [SecurityAPI::class, 'startChallenge']);
Route::post('/otp/challenge/verify', [SecurityAPI::class, 'verifyChallenge']);
Route::post('/otp/challenge/inbox', [SecurityAPI::class, 'challengeInbox']);
Route::get('/products/filter', [ProductsAPI::class, 'filterCatalog']);
Route::get('/products/categories', [ProductsAPI::class, 'productCategories']);
Route::get('/products/search', [ProductsAPI::class, 'searchProducts']);
Route::get('/products/sort', [ProductsAPI::class, 'sortProducts']);
Route::get('/products/view', [ProductsAPI::class, 'viewProductDetails']);
Route::get('/reviews/display', [ProductsAPI::class, 'displayReviews']);
Route::get('/reviews/score', [ProductsAPI::class, 'scoreRating']);
Route::post('/checkout/payment/webhook', [OrdersAPI::class, 'paymentWebhook']);
Route::middleware('auth:api')->group(function () {
    Route::post('/auth/logout', [SecurityAPI::class, 'logout']);
    Route::post('/auth/emp_signup', [SecurityAPI::class, 'employeeSignup'])->middleware('role:super_admin');
    Route::post('/auth/backup_credentials', [SecurityAPI::class, 'backupCredentials']);
    Route::put('/auth/update_credentials', [SecurityAPI::class, 'updateCredentials']);

    Route::post('/otp/issue', [SecurityAPI::class, 'issue']);
    Route::post('/otp/verify', [SecurityAPI::class, 'verify']);

    Route::post('/cart/add', [UserAPI::class, 'addOrder']);
    Route::match(['get', 'post'], '/cart/display', [UserAPI::class, 'displayOrders']);
    Route::get('/cart/search', [UserAPI::class, 'searchOrders']);
    Route::get('/cart/sort', [UserAPI::class, 'sortOrders']);
    Route::delete('/cart/remove', [UserAPI::class, 'removeOrder']);
    Route::post('/cart/clear', [UserAPI::class, 'clearCart']);

    Route::post('/checkout/dispatch', [OrdersAPI::class, 'determineDispatchDetails']);
    Route::post('/checkout/payment', [OrdersAPI::class, 'integratePayment']);
    Route::post('/checkout/payment/intent', [OrdersAPI::class, 'createPaymentIntent']);

    Route::middleware('role:staff')->group(function () {
        Route::get('/reports', [SystemAPI::class, 'index']);
        Route::post('/reports', [SystemAPI::class, 'store']);
        Route::get('/reports/{id}', [SystemAPI::class, 'show']);
        Route::put('/reports/{id}', [SystemAPI::class, 'update']);
        Route::delete('/reports/{id}', [SystemAPI::class, 'destroy']);
    });

    Route::post('/orders/add', [UserAPI::class, 'updateBagLine']);
    Route::put('/orders/update', [OrdersAPI::class, 'updateOrderDetails']);
    Route::delete('/orders/remove', [UserAPI::class, 'removeOrder']);
    Route::post('/orders/delivery-details', [OrdersAPI::class, 'submitDeliveryDetails']);
    Route::post('/orders/delivery-fee', [OrdersAPI::class, 'confirmDeliveryFeePayment']);
    Route::post('/orders/switch-claiming', [OrdersAPI::class, 'switchClaimingMethod']);

    Route::post('/pos/add', [OrdersAPI::class, 'addProductToOrder'])->middleware('role:admin');
    Route::post('/pos/checkout', [OrdersAPI::class, 'checkoutOrder'])->middleware('role:admin');
    Route::put('/pos/update', [OrdersAPI::class,'posUpdateOrderDetails'])->middleware('role:admin');
    Route::delete('/pos/remove', [OrdersAPI::class, 'removeProductFromOrder'])->middleware('role:admin');

    Route::post('/notif/create', [SystemAPI::class, 'createNotification'])->middleware('role:staff');
    Route::post('/notif/distribute', [SystemAPI::class, 'distributeNotifications'])->middleware('role:staff');
    Route::put('/notif/update', [SystemAPI::class, 'updateNotificationStatus']);
    Route::get('/notif/display', [SystemAPI::class, 'displayNotifications']);

    Route::post('/tracking/create', [OrdersAPI::class, 'createFulfillmentTrack']);
    Route::put('/tracking/update', [OrdersAPI::class, 'updateFulfillmentStatus'])->middleware('role:staff');
    Route::put('/tracking/close', [OrdersAPI::class, 'closeFulfillmentTrack'])->middleware('role:staff');
    Route::post('/tracking/scan', [OrdersAPI::class, 'scanCode']);

    Route::post('/access/flag', [SystemAPI::class, 'flagIrregularity'])->middleware('role:staff');
    Route::post('/access/log', [SystemAPI::class, 'logAction'])->middleware('role:staff');
    Route::get('/access/logs', [SystemAPI::class, 'accessLog'])->middleware('role:super_admin');

    Route::get('/accounts/me', [SystemAPI::class, 'displayMyAccount']);
    Route::put('/accounts/type', [SystemAPI::class, 'changeAccountType'])->middleware('role:super_admin');
    Route::delete('/accounts/delete', [SystemAPI::class, 'deleteAccount'])->middleware('role:super_admin');
    Route::post('/accounts/disable', [SystemAPI::class, 'disableAccount'])->middleware('role:super_admin');
    Route::get('/accounts/display', [SystemAPI::class, 'displayAccounts'])->middleware('role:staff');
    Route::post('/accounts/recover', [SystemAPI::class, 'recoverAccount'])->middleware('role:super_admin');
    Route::get('/accounts/search', [SystemAPI::class, 'searchAccounts'])->middleware('role:staff');
    Route::get('/accounts/sort', [SystemAPI::class, 'sortAccounts'])->middleware('role:staff');
    Route::put('/accounts/update', [SystemAPI::class, 'updateAccountDetails']);

    Route::post('/appoint/close', [AppointmentsAPI::class, 'closeAppointment'])->middleware('role:admin');
    Route::post('/appoint/create', [AppointmentsAPI::class, 'createAppointment']);
    Route::get('/appoint/display', [AppointmentsAPI::class, 'displayAppointments']);
    Route::get('/appoint/search', [AppointmentsAPI::class, 'searchAppointments']);
    Route::get('/appoint/sort', [AppointmentsAPI::class, 'sortAppointments']);
    Route::get('/appoint/slots', [AppointmentsAPI::class, 'displaySlots']);
    Route::put('/appoint/update', [AppointmentsAPI::class, 'updateAppointmentDetails']);
    Route::get('/appoint/reschedule-requests', [AppointmentsAPI::class, 'rescheduleRequests'])->middleware('role:admin');
    Route::post('/appoint/reschedule-request', [AppointmentsAPI::class, 'createRescheduleRequest']);

    Route::post('/uploads', [ProductsAPI::class, 'uploadImage']);

    Route::post('/products/add', [ProductsAPI::class, 'addProduct'])->middleware('role:admin');
    Route::get('/products/sales', [ProductsAPI::class, 'productSales'])->middleware('role:admin');
    Route::get('/products/orders', [ProductsAPI::class, 'displayOrders'])->middleware('role:staff');
    Route::delete('/products/remove', [ProductsAPI::class, 'removeProduct'])->middleware('role:admin');
    Route::put('/products/update', [ProductsAPI::class, 'updateProductDetails'])->middleware('role:admin');
    Route::post('/products/unlist', [ProductsAPI::class, 'unlistProduct'])->middleware('role:admin');
    Route::post('/products/sell', [ProductsAPI::class, 'sellProduct'])->middleware('role:admin');

    Route::post('/reviews/create', [ProductsAPI::class, 'createReview']);
    Route::delete('/reviews/delete', [ProductsAPI::class, 'deleteReview'])->middleware('role:admin');
    Route::post('/reviews/moderate', [ProductsAPI::class, 'moderateReview'])->middleware('role:admin');
    Route::put('/reviews/update', [ProductsAPI::class, 'updateReview']);

    Route::get('/settings/display', [SystemAPI::class, 'displaySettings']);
    Route::put('/settings/update', [SystemAPI::class, 'updateSettings']);

    Route::post('/wishlist/add', [UserAPI::class, 'addWishlistItem']);
    Route::post('/wishlist/to_order', [UserAPI::class, 'addWishlistToOrder']);
    Route::match(['get', 'post'], '/wishlist/display', [UserAPI::class, 'displayWishlist']);
    Route::match(['delete', 'post'], '/wishlist/remove', [UserAPI::class, 'removeWishlistItem']);
    Route::put('/wishlist/update', [UserAPI::class, 'updateWishlistItem']);

    Route::get('/shifts', [SystemAPI::class, 'displayShifts'])->middleware('role:staff');
    Route::post('/shifts', [SystemAPI::class, 'createShift'])->middleware('role:admin');
    Route::put('/shifts/{shiftId}', [SystemAPI::class, 'updateShift'])->middleware('role:admin');
    Route::delete('/shifts/{shiftId}', [SystemAPI::class, 'cancelShift'])->middleware('role:admin');
});
