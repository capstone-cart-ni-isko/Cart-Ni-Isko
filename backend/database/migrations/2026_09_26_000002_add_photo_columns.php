<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add nullable profile-photo columns (URL of a real uploaded file served
     * by the backend) to customer and employee. Schema-only change: it never
     * inserts, edits, or removes any data row.
     */
    public function up(): void
    {
        if (Schema::hasTable('customer') && ! Schema::hasColumn('customer', 'cust_photo')) {
            Schema::table('customer', function (Blueprint $table) {
                $table->text('cust_photo')->nullable();
            });
        }

        if (Schema::hasTable('employee') && ! Schema::hasColumn('employee', 'emp_photo')) {
            Schema::table('employee', function (Blueprint $table) {
                $table->text('emp_photo')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('customer') && Schema::hasColumn('customer', 'cust_photo')) {
            Schema::table('customer', function (Blueprint $table) {
                $table->dropColumn('cust_photo');
            });
        }

        if (Schema::hasTable('employee') && Schema::hasColumn('employee', 'emp_photo')) {
            Schema::table('employee', function (Blueprint $table) {
                $table->dropColumn('emp_photo');
            });
        }
    }
};