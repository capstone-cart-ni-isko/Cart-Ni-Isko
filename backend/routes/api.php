<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthAPI;

Route::post('/auth/cust_signup', [AuthAPI::class, 'customerSignup']);
Route::post('/auth/cust_login', [AuthAPI::class, 'customerLogin']);
Route::post('/auth/emp_signup', [AuthAPI::class, 'employeeSignup']);
Route::post('/auth/emp_login', [AuthAPI::class, 'employeeLogin']);

Route::middleware('auth:sanctum')->group(function () {
    // Protected routes go here
});