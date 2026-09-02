<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AccessAPI;
use App\Http\Controllers\AccountsAPI;
use App\Http\Controllers\AppointAPI;
use App\Http\Controllers\AuthAPI;
use App\Http\Controllers\CartAPI;
use App\Http\Controllers\CheckoutAPI;
use App\Http\Controllers\ProductsAPI;
use App\Http\Controllers\ReviewsAPI;
use App\Http\Controllers\SettingsAPI;
use App\Http\Controllers\WishlistAPI;

// Cart API Routes
Route::post('/cart/add', [CartAPI::class, 'addOrder']);
Route::get('/cart/display', [CartAPI::class, 'displayOrders']);
Route::get('/cart/search', [CartAPI::class, 'searchOrders']);
Route::get('/cart/sort', [CartAPI::class, 'sortOrders']);
Route::delete('/cart/remove', [CartAPI::class, 'removeOrder']);

// Checkout API Routes
Route::post('/checkout/dispatch', [CheckoutAPI::class, 'determineDispatchDetails']);
Route::post('/checkout/payment', [CheckoutAPI::class, 'integratePayment']);



// Auth API Routes
Route::post('/auth/cust_signup', [AuthAPI::class, 'customerSignup']);
Route::post('/auth/cust_login', [AuthAPI::class, 'customerLogin']);
Route::post('/auth/emp_signup', [AuthAPI::class, 'employeeSignup']);
Route::post('/auth/emp_login', [AuthAPI::class, 'employeeLogin']);
Route::post('/auth/backup_credentials', [AuthAPI::class, 'backupCredentials']);
Route::post('/auth/recover_credentials', [AuthAPI::class, 'recoverCredentials']);
Route::put('/auth/update_credentials', [AuthAPI::class, 'updateCredentials']);

// Access API Routes
Route::post('/access/flag', [AccessAPI::class, 'flagIrregularity']);
Route::post('/access/log', [AccessAPI::class, 'logAction']);

// Accounts API Routes
Route::put('/accounts/type', [AccountsAPI::class, 'changeAccountType']);
Route::delete('/accounts/delete', [AccountsAPI::class, 'deleteAccount']);
Route::post('/accounts/disable', [AccountsAPI::class, 'disableAccount']);
Route::get('/accounts/display', [AccountsAPI::class, 'displayAccounts']);
Route::post('/accounts/recover', [AccountsAPI::class, 'recoverAccount']);
Route::get('/accounts/search', [AccountsAPI::class, 'searchAccounts']);
Route::get('/accounts/sort', [AccountsAPI::class, 'sortAccounts']);
Route::put('/accounts/update', [AccountsAPI::class, 'updateAccountDetails']);

// Appoint API Routes
Route::post('/appoint/close', [AppointAPI::class, 'closeAppointment']);
Route::post('/appoint/create', [AppointAPI::class, 'createAppointment']);
Route::get('/appoint/display', [AppointAPI::class, 'displayAppointments']);
Route::get('/appoint/search', [AppointAPI::class, 'searchAppointments']);
Route::get('/appoint/sort', [AppointAPI::class, 'sortAppointments']);
Route::put('/appoint/update', [AppointAPI::class, 'updateAppointmentDetails']);

// Products API Routes
Route::post('/products/add', [ProductsAPI::class, 'addProduct']);
Route::get('/products/orders', [ProductsAPI::class, 'displayOrders']);
Route::get('/products/filter', [ProductsAPI::class, 'filterCatalog']);
Route::delete('/products/remove', [ProductsAPI::class, 'removeProduct']);
Route::get('/products/search', [ProductsAPI::class, 'searchProducts']);
Route::get('/products/sort', [ProductsAPI::class, 'sortProducts']);
Route::put('/products/update', [ProductsAPI::class, 'updateProductDetails']);
Route::get('/products/view', [ProductsAPI::class, 'viewProductDetails']);
Route::post('/products/unlist', [ProductsAPI::class, 'unlistProduct']);
Route::post('/products/sell', [ProductsAPI::class, 'sellProduct']);

// Reviews API Routes
Route::post('/reviews/create', [ReviewsAPI::class, 'createReview']);
Route::delete('/reviews/delete', [ReviewsAPI::class, 'deleteReview']);
Route::get('/reviews/display', [ReviewsAPI::class, 'displayReviews']);
Route::post('/reviews/moderate', [ReviewsAPI::class, 'moderateReview']);
Route::get('/reviews/score', [ReviewsAPI::class, 'scoreRating']);
Route::put('/reviews/update', [ReviewsAPI::class, 'updateReview']);

// Settings API Routes
Route::get('/settings/display', [SettingsAPI::class, 'displaySettings']);
Route::put('/settings/update', [SettingsAPI::class, 'updateSettings']);

// Wishlist API Routes
Route::post('/wishlist/add', [WishlistAPI::class, 'addWishlistItem']);
Route::post('/wishlist/to_order', [WishlistAPI::class, 'addWishlistToOrder']);
Route::get('/wishlist/display', [WishlistAPI::class, 'displayWishlist']);
Route::delete('/wishlist/remove', [WishlistAPI::class, 'removeWishlistItem']);
Route::put('/wishlist/update', [WishlistAPI::class, 'updateWishlistItem']);

Route::middleware('auth:sanctum')->group(function () {
    // Protected routes go here
});