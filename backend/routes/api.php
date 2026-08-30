<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthAPI;
use App\Http\Controllers\ProductsAPI;

Route::post('/auth/cust_signup', [AuthAPI::class, 'customerSignup']);
Route::post('/auth/cust_login', [AuthAPI::class, 'customerLogin']);
Route::post('/auth/emp_signup', [AuthAPI::class, 'employeeSignup']);
Route::post('/auth/emp_login', [AuthAPI::class, 'employeeLogin']);

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

Route::middleware('auth:sanctum')->group(function () {
    // Protected routes go here
});