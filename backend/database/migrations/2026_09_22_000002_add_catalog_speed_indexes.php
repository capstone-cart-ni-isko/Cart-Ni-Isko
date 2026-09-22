<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds b-tree indexes on the product columns the hot read paths filter on, so
 * Supabase can answer them without a full table scan as the catalog grows:
 *
 *  - product_active_idx (prod_deleted, prod_disabled): the active-catalog
 *    filter shared by /products/filter?status=active (admin inventory + shop),
 *    /products/search and /products/sort.
 *  - product_categ_idx  (prod_categ): category filter on the catalog.
 *  - product_qty_idx    (prod_qty): in/out/low stock filters.
 *  - product_tag_idx    (prod_tag): product-detail and wishlist lookups by tag.
 *
 * Indexes never change query results - purely additive, no behavior change.
 * The tables already exist in Supabase, so the hasTable guard keeps this a
 * no-op on connections where the store tables were never created (same
 * pattern as 2026_09_22_000000_create_store_tables).
 *
 * The wishlist table needs no extra index: its composite primary key
 * (cust_id, prod_id) already covers every wishlist query, and auth lookups
 * (cust_phone / emp_email) already have unique indexes.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('product')) {
            return;
        }

        Schema::table('product', function (Blueprint $table) {
            $table->index(['prod_deleted', 'prod_disabled'], 'product_active_idx');
            $table->index('prod_categ', 'product_categ_idx');
            $table->index('prod_qty', 'product_qty_idx');
            $table->index('prod_tag', 'product_tag_idx');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('product')) {
            return;
        }

        Schema::table('product', function (Blueprint $table) {
            $table->dropIndex('product_active_idx');
            $table->dropIndex('product_categ_idx');
            $table->dropIndex('product_qty_idx');
            $table->dropIndex('product_tag_idx');
        });
    }
};
