<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthAPI;

Route::get('/', function () {
    return view('welcome');
});

// Routes defined here do NOT require the /api prefix
Route::post('/cust_signup', [AuthAPI::class, 'customerSignup']);
Route::post('/cust_login', [AuthAPI::class, 'customerLogin']);
Route::post('/emp_signup', [AuthAPI::class, 'employeeSignup']);
Route::post('/emp_login', [AuthAPI::class, 'employeeLogin']);