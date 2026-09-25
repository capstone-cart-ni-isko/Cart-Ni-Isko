<?php
// Recovery tool: seeds one SUPER ADMIN employee so the admin side is
// usable again when a restored backup contains no super-admin account.
//
//   php seed_super_admin.php "Givname" "Surname" "email" "09XXXXXXXXX" "TempPass123!" [studnum] [birthday YYYY-MM-DD]
//
// Idempotent: does nothing when any SUPER ADMIN employee already exists.
// Boots Laravel so the password is hashed exactly like AuthAPI does.
$args = array_slice($argv, 1);
if (count($args) < 5) {
    fwrite(STDERR, "usage: php seed_super_admin.php \"Givname\" \"Surname\" \"email\" \"phone\" \"password\" [studnum] [birthday]\n");
    exit(1);
}

[$givname, $surname, $email, $phone, $password] = $args;
$studnum = $args[5] ?? '';
$birthday = $args[6] ?? '2000-01-01';

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Employee;
use Illuminate\Support\Facades\Hash;

if (Employee::whereRaw('UPPER(emp_type) LIKE ?', ['%SUPER ADMIN%'])->exists()) {
    echo "skipped: a SUPER ADMIN employee already exists\n";
    exit(0);
}

$employee = Employee::create([
    'emp_surname'   => $surname,
    'emp_givname'   => $givname,
    'emp_midname'   => '',
    'emp_suffix'    => '',
    'emp_studnum'   => $studnum,
    'emp_pronoun'   => '',
    'emp_birthday'  => $birthday,
    'emp_brgy'      => '',
    'emp_city'      => '',
    'emp_province'  => '',
    'emp_country'   => '',
    'emp_callcode'  => '+63',
    'emp_phone'     => $phone,
    'emp_email'     => $email,
    'emp_type'      => 'SUPER ADMIN',
    'emp_instore'   => 0,
    'emp_password'  => Hash::make($password),
]);

echo "created SUPER ADMIN emp_id={$employee->emp_id} ({$email})\n";
