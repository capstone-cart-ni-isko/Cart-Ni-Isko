<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Wipe all business data except customer and employee tables.
 *
 * Keeps the framework tables (migrations, Sanctum tokens, password
 * resets, cache, queue jobs) intact so the application continues
 * to function. Resets the cust_id / emp_id sequences so the next
 * insert starts from the maximum existing value rather than a
 * stale high watermark.
 *
 * No existing customer or employee rows are edited — only other
 * tables are truncated.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer')) return;

        $keep = ['customer', 'employee', 'migrations', 'personal_access_tokens',
                 'password_reset_tokens', 'cache', 'cache_locks', 'sessions',
                 'jobs', 'failed_jobs', 'users'];

        $all = DB::select("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
        foreach ($all as $row) {
            $table = $row->tablename;
            if (in_array($table, $keep)) continue;
            DB::statement("TRUNCATE \"$table\" RESTART IDENTITY CASCADE");
        }

        // Reset cust_id / emp_id sequences to restart from 1.
        // Postgres sequences cannot use MINVALUE 0, so 1 is the
        // nearest valid start. If existing rows carry higher IDs,
        // the next INSERT will collide; advance the sequence past
        // the current maximum to avoid that.
        DB::statement("ALTER SEQUENCE customer_cust_id_seq RESTART WITH 1");
        DB::statement("ALTER SEQUENCE employee_emp_id_seq RESTART WITH 1");
        DB::statement("SELECT setval('customer_cust_id_seq', (SELECT COALESCE(MAX(cust_id), 0) FROM customer))");
        DB::statement("SELECT setval('employee_emp_id_seq', (SELECT COALESCE(MAX(emp_id), 0) FROM employee))");
    }

    public function down(): void
    {
        // No-op — truncated data cannot be recovered.
    }
};
