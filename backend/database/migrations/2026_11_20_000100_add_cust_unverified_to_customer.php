<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * BUG-05 (user evaluation): a signup that never finished phone verification
 * used to lock its email and phone forever ("Email already registered"),
 * because the pending state lived only in a 7-day cache entry.
 *
 * `cust_unverified` holds the time an online signup was started and is
 * cleared once the signup code is verified. NULL means a normal account, so
 * every existing row (and the walk-in record) keeps working unchanged. A new
 * signup that hits an email/phone held by an unverified row reuses that row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('customer') && ! Schema::hasColumn('customer', 'cust_unverified')) {
            Schema::table('customer', function (Blueprint $table) {
                $table->timestamp('cust_unverified')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('customer') && Schema::hasColumn('customer', 'cust_unverified')) {
            Schema::table('customer', function (Blueprint $table) {
                $table->dropColumn('cust_unverified');
            });
        }
    }
};
