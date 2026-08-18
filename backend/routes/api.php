<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\api_auth;

Route::post('/auth/cust_signup', [api_auth::class, 'cust_signup']);
Route::post('/auth/cust_login', [api_auth::class, 'cust_login']);
Route::post('/auth/emp_signup', [api_auth::class, 'emp_signup']);
Route::post('/auth/emp_login', [api_auth::class, 'emp_login']);

Route::middleware('auth:sanctum')->group(function () {
    // Protected routes go here
});