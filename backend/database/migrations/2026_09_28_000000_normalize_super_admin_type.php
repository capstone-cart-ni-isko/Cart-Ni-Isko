<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Normalize super-admin employee types to the canonical "SUPER ADMIN".
 *
 * Earlier seeds stored "SUPER_ADMIN" (underscore), which the role checks,
 * validators and admin notifications (all written against "SUPER ADMIN")
 * did not recognise, so the account was treated as a plain admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('employee')
            ->whereRaw("UPPER(REPLACE(emp_type, '_', ' ')) = 'SUPER ADMIN'")
            ->where('emp_type', '!=', 'SUPER ADMIN')
            ->update(['emp_type' => 'SUPER ADMIN']);
    }

    public function down(): void
    {
        // Irreversible data fix: "SUPER ADMIN" is the canonical value.
    }
};
