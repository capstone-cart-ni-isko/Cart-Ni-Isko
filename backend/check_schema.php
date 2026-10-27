<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$cols = DB::select("
    SELECT column_name, column_default, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_name in ('emplog', 'custlog')
");
print_r($cols);
