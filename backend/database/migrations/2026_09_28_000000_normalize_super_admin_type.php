<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Store the super admin type the way the rest of the app spells it.
 *
 * seed_super_admin writes 'SUPER_ADMIN', but every other emp_type value in the
 * schema uses a space ('SUPER ADMIN', 'ADMIN', 'STAFF'), so the underscore
 * form is normalized here.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('employee')
            ->where('emp_type', 'SUPER_ADMIN')
            ->update(['emp_type' => 'SUPER ADMIN']);
    }

    public function down(): void
    {
        DB::table('employee')
            ->where('emp_type', 'SUPER ADMIN')
            ->update(['emp_type' => 'SUPER_ADMIN']);
    }
};
