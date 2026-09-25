<?php

use Illuminate\Support\Facades\Route;

// The SPA is served by the frontend; every data operation goes through the
// authenticated JSON API in routes/api.php (no duplicate public endpoints).
Route::get('/', function () {
    return view('welcome');
});