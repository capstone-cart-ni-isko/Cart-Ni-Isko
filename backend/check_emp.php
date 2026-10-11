<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make('Illuminate\Contracts\Console\Kernel');
$kernel->bootstrap();
use App\Models\Employee;
$count = Employee::count();
echo "Employee count: $count\n";
$employees = Employee::all();
foreach ($employees as $emp) {
    echo "Employee: {$emp->emp_id} - {$emp->emp_surname}, {$emp->emp_givname} - type: {$emp->emp_type}\n";
}