<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add the optional pay_id foreign key column to the pickup table.
 *
 * The column is made NULLABLE so that pickup records created before a
 * payment is confirmed (e.g. PayMongo redirect flow) do not fail an
 * NOT NULL constraint.  The corresponding payment can be linked later
 * once the webhook confirms settlement.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('pickup') && ! Schema::hasColumn('pickup', 'pay_id')) {
            Schema::table('pickup', function (Blueprint $table) {
                $table->bigInteger('pay_id')->nullable()->after('ord_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('pickup') && Schema::hasColumn('pickup', 'pay_id')) {
            Schema::table('pickup', function (Blueprint $table) {
                $table->dropColumn('pay_id');
            });
        }
    }
};
