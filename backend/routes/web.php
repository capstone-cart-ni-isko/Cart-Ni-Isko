<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthAPI;
use App\Http\Controllers\CartAPI;

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