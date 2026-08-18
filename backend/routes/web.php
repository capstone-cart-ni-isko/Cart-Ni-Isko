<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\api_auth;

Route::get('/', function () {
    return view('welcome');
});

// Routes defined here do NOT require the /api prefix
Route::post('/cust_signup', [api_auth::class, 'cust_signup']);
Route::post('/cust_login', [api_auth::class, 'cust_login']);
Route::post('/emp_signup', [api_auth::class, 'emp_signup']);
Route::post('/emp_login', [api_auth::class, 'emp_login']);