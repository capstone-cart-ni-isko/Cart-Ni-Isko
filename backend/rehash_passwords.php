<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Customer;
use App\Models\Employee;
use Illuminate\Support\Facades\Hash;

$custCount = 0;
$customers = Customer::all();
foreach ($customers as $cust) {
    $pwd = (string) $cust->cust_password;
    if ($pwd !== '' && ! str_starts_with($pwd, '$2y$') && ! str_starts_with($pwd, '$2a$')) {
        $cust->cust_password = Hash::make($pwd);
        $cust->save();
        $custCount++;
    }
}

$empCount = 0;
$employees = Employee::all();
foreach ($employees as $emp) {
    $pwd = (string) $emp->emp_password;
    if ($pwd !== '' && ! str_starts_with($pwd, '$2y$') && ! str_starts_with($pwd, '$2a$')) {
        $emp->emp_password = Hash::make($pwd);
        $emp->save();
        $empCount++;
    }
}

echo "Rehashed {$custCount} customer passwords and {$empCount} employee passwords to Bcrypt.\n";
