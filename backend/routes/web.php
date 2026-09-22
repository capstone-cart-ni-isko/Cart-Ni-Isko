<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthAPI;
use App\Http\Controllers\CartAPI;
use App\Http\Controllers\CheckoutAPI;
use App\Http\Controllers\OrdersAPI;
use App\Http\Controllers\PosAPI;

Route::get('/', function () {
    return view('welcome');
});

// Routes defined here do NOT require the /api prefix
Route::post('/cust_signup', [AuthAPI::class, 'customerSignup']);
Route::post('/cust_login', [AuthAPI::class, 'customerLogin']);
Route::post('/emp_signup', [AuthAPI::class, 'employeeSignup']);
Route::post('/emp_login', [AuthAPI::class, 'employeeLogin']);
Route::post('/backup_credentials', [AuthAPI::class, 'backupCredentials']);
Route::post('/recover_credentials', [AuthAPI::class, 'recoverCredentials']);
Route::put('/update_credentials', [AuthAPI::class, 'updateCredentials']);

// Cart Routes
Route::post('/cart/add', [CartAPI::class, 'addOrder']);
Route::get('/cart/display', [CartAPI::class, 'displayOrders']);
Route::get('/cart/search', [CartAPI::class, 'searchOrders']);
Route::get('/cart/sort', [CartAPI::class, 'sortOrders']);
Route::delete('/cart/remove', [CartAPI::class, 'removeOrder']);

// Checkout Routes
Route::post('/checkout/dispatch', [CheckoutAPI::class, 'determineDispatchDetails']);
Route::post('/checkout/payment', [CheckoutAPI::class, 'integratePayment']);

// Orders Routes
Route::post('/orders/add', [OrdersAPI::class, 'addProductToOrder']);
Route::put('/orders/update', [OrdersAPI::class, 'updateOrderDetails']);
Route::delete('/orders/remove', [OrdersAPI::class, 'removeProductFromOrder']);

// POS Routes
Route::post('/pos/add', [PosAPI::class, 'addProductToOrder']);
Route::post('/pos/checkout', [PosAPI::class, 'checkoutOrder']);
Route::put('/pos/update', [PosAPI::class, 'updateOrderDetails']);
Route::delete('/pos/remove', [PosAPI::class, 'removeProductFromOrder']);