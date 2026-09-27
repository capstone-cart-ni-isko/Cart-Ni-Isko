<?php

require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$tables = ["customer","employee","product","orders","items","payment","pickup","appointment","parcel","delivery","custnotif","empnotif","reports","custlog","emplog","duty_shift","settings"];

foreach ($tables as $t) {
    echo strtoupper($t) . " columns:\n";
    print_r(\Illuminate\Support\Facades\Schema::getColumnListing($t));
    echo "\n";
}