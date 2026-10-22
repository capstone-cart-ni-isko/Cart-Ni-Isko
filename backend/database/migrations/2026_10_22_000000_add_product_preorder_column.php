<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The product-level pre-order switch.
     *
     * `prodvar.prodvar_preorder` already exists and flags a single variation.
     * This column is the switch the admin uses on a WHOLE product: "Mark
     * Pre-order" / "Mark In Stock" in the inventory list. When it is on, every
     * variation of the product follows it.
     *
     * Idempotent: a database that already has the column (or that never got
     * the earlier "product extras" migration) is left exactly as it is.
     */
    public function up(): void
    {
        if (! Schema::hasTable('product')) {
            return;
        }

        if (! Schema::hasColumn('product', 'prod_preorder')) {
            Schema::table('product', function (Blueprint $table) {
                $table->boolean('prod_preorder')->default(false);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('product') && Schema::hasColumn('product', 'prod_preorder')) {
            Schema::table('product', function (Blueprint $table) {
                $table->dropColumn('prod_preorder');
            });
        }
    }
};
