<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The one column the register's Apply Discount action needs:
 * orders.ord_discount - the peso amount taken off the amount due at checkout.
 *
 * NO other part of the schema is changed: no table is created, dropped or
 * renamed, no other column is added, and no existing row is rewritten (the
 * column is nullable, so every existing order simply reads as no discount).
 *
 * The live connection already runs the system-new.docx SCHEMA, so the addition
 * is guarded by hasColumn() and is a no-op wherever the column already exists.
 *
 * Apply it on its own - never as part of the full pending batch:
 *
 *   php artisan migrate --path=database/migrations/2026_10_09_000000_add_pos_discount_column.php
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('orders') || Schema::hasColumn('orders', 'ord_discount')) {
            return;
        }

        Schema::table('orders', static function (Blueprint $table) {
            // Nullable instead of defaulted: existing orders keep their rows
            // untouched and are read as "no discount" (0) by the POS.
            $table->decimal('ord_discount', 10, 2)->nullable();
        });
    }

    public function down(): void
    {
        // Part of the schema the register now writes to: never dropped.
    }
};
