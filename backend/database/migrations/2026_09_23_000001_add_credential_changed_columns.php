<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the credential-change timestamps used to enforce REQ-APC-01
 * (sensitive credentials cannot change within thirty days of the most
 * recent change). The stamp is set on signup and on every credential
 * update; a NULL stamp means "never changed" and allows the change.
 *
 * Both columns are guarded with Schema::hasTable/hasColumn so the
 * migration is a no-op where they already exist.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('customer') && !Schema::hasColumn('customer', 'cust_cred_changed')) {
            Schema::table('customer', function (Blueprint $table) {
                $table->timestamp('cust_cred_changed')->nullable()->after('cust_email');
            });
        }

        if (Schema::hasTable('employee') && !Schema::hasColumn('employee', 'emp_cred_changed')) {
            Schema::table('employee', function (Blueprint $table) {
                $table->timestamp('emp_cred_changed')->nullable()->after('emp_email');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('customer') && Schema::hasColumn('customer', 'cust_cred_changed')) {
            Schema::table('customer', function (Blueprint $table) {
                $table->dropColumn('cust_cred_changed');
            });
        }

        if (Schema::hasTable('employee') && Schema::hasColumn('employee', 'emp_cred_changed')) {
            Schema::table('employee', function (Blueprint $table) {
                $table->dropColumn('emp_cred_changed');
            });
        }
    }
};
