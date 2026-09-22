<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Idempotent: skip when the live table already has the columns (or has
        // not been created yet by the preceding create_store_tables migration).
        if (!Schema::hasTable('product') || Schema::hasColumn('product', 'prod_sizes')) {
            return;
        }

        Schema::table('product', function (Blueprint $table) {
            $table->json('prod_sizes')->nullable()->after('prod_todaysold');
            $table->json('prod_colors')->nullable()->after('prod_sizes');
            $table->json('prod_images')->nullable()->after('prod_colors');
            $table->boolean('prod_preorder')->default(false)->after('prod_images');
            $table->string('prod_status')->nullable()->after('prod_preorder');
            $table->json('prod_preorder_info')->nullable()->after('prod_status');
            $table->json('prod_stock_matrix')->nullable()->after('prod_preorder_info');
            $table->json('prod_details')->nullable()->after('prod_stock_matrix');
            $table->decimal('prod_rating', 3, 1)->nullable()->after('prod_details');
            $table->integer('prod_review_count')->default(0)->after('prod_rating');
            $table->json('prod_rating_breakdown')->nullable()->after('prod_review_count');
            $table->json('prod_reviews')->nullable()->after('prod_rating_breakdown');
        });
    }

    public function down(): void
    {
        Schema::table('product', function (Blueprint $table) {
            $table->dropColumn([
                'prod_sizes',
                'prod_colors',
                'prod_images',
                'prod_preorder',
                'prod_status',
                'prod_preorder_info',
                'prod_stock_matrix',
                'prod_details',
                'prod_rating',
                'prod_review_count',
                'prod_rating_breakdown',
                'prod_reviews',
            ]);
        });
    }
};
