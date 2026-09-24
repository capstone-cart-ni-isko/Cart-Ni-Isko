<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Seed a single super-admin account for initial setup.
 *
 * Username: super
 * Email:    super@super.com
 * Password: super_123
 * emp_type: SUPER_ADMIN (rank 3 per EnsureRole middleware)
 *
 * This migration is idempotent — it inserts only if the row does not exist.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! DB::table('employee')->where('emp_email', 'super@super.com')->exists()) {
            DB::table('employee')->insert([
                'emp_created'    => now(),
                'emp_givname'    => 'Super',
                'emp_surname'    => 'Admin',
                'emp_pronoun'    => 'they/them',
                'emp_email'      => 'super@super.com',
                'emp_password'   => Hash::make('super_123'),
                'emp_type'       => 'SUPER_ADMIN',
                'emp_phone'      => '+639000000001',
                'emp_birthday'   => '2000-01-01',
                'emp_brgy'       => '',
                'emp_city'       => '',
                'emp_province'   => '',
                'emp_country'    => 'PH',
                'emp_callcode'   => '+63',
                'emp_instore'    => false,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('employee')->where('emp_email', 'super@super.com')->delete();
    }
};
