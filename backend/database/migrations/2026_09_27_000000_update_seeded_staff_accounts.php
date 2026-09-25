<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Replace the placeholder seeded login with the project's staff accounts.
 *
 * Super Admin:          superadmin@bicol-u.edu.ph / admin123  (SUPER ADMIN)
 * Staff (Student Officer): maria.santos@bicol-u.edu.ph / staff123  (STAFF)
 *
 * The old super@super.com row is renamed in place so its emp_id (and any
 * logs or notifications tied to it) are kept. emp_cred_changed is stamped so
 * these accounts are not treated as temporary-password accounts, which
 * AuthAPI::employeeLogin rejects 24 hours after creation.
 *
 * Idempotent: re-running only resets the two passwords.
 */
return new class extends Migration
{
    private const OLD_SUPER = 'super@super.com';
    private const SUPER = 'superadmin@bicol-u.edu.ph';
    private const STAFF = 'maria.santos@bicol-u.edu.ph';

    public function up(): void
    {
        $now = now();

        $superAttributes = [
            'emp_email'        => self::SUPER,
            'emp_password'     => Hash::make('admin123'),
            'emp_type'         => 'SUPER ADMIN',
            'emp_cred_changed' => $now,
        ];

        if (DB::table('employee')->where('emp_email', self::SUPER)->exists()) {
            DB::table('employee')->where('emp_email', self::SUPER)->update($superAttributes);
        } elseif (DB::table('employee')->where('emp_email', self::OLD_SUPER)->exists()) {
            DB::table('employee')->where('emp_email', self::OLD_SUPER)->update($superAttributes);
        } else {
            DB::table('employee')->insert($superAttributes + [
                'emp_created'  => $now,
                'emp_givname'  => 'Super',
                'emp_surname'  => 'Admin',
                'emp_pronoun'  => 'they/them',
                'emp_phone'    => '+639000000001',
                'emp_birthday' => '2000-01-01',
                'emp_brgy'     => '',
                'emp_city'     => '',
                'emp_province' => '',
                'emp_country'  => 'PH',
                'emp_callcode' => '+63',
                'emp_instore'  => false,
            ]);
        }

        $staffAttributes = [
            'emp_password'     => Hash::make('staff123'),
            'emp_type'         => 'STAFF',
            'emp_cred_changed' => $now,
        ];

        if (DB::table('employee')->where('emp_email', self::STAFF)->exists()) {
            DB::table('employee')->where('emp_email', self::STAFF)->update($staffAttributes);
        } else {
            DB::table('employee')->insert($staffAttributes + [
                'emp_created'  => $now,
                'emp_email'    => self::STAFF,
                'emp_givname'  => 'Maria',
                'emp_surname'  => 'Santos',
                'emp_pronoun'  => 'they/them',
                'emp_phone'    => '+639000000002',
                'emp_birthday' => '2003-01-01',
                'emp_brgy'     => '',
                'emp_city'     => '',
                'emp_province' => '',
                'emp_country'  => 'PH',
                'emp_callcode' => '+63',
                'emp_instore'  => false,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('employee')->where('emp_email', self::STAFF)->delete();
        DB::table('employee')->where('emp_email', self::SUPER)->update([
            'emp_email'    => self::OLD_SUPER,
            'emp_password' => Hash::make('super_123'),
        ]);
    }
};
