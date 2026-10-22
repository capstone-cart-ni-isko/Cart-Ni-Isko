<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Idempotent, column by column: skip when the live table already has
        // a column (or has not been created yet by the preceding
        // create_store_tables migration). A database that already carries
        // some of these columns - because a later, narrower migration added
        // one of them - must not fail on the duplicate.
        if (!Schema::hasTable('product')) {
            return;
        }

        $columns = [
            'prod_sizes'            => fn (Blueprint $table) => $table->json('prod_sizes')->nullable()->after('prod_todaysold'),
            'prod_colors'           => fn (Blueprint $table) => $table->json('prod_colors')->nullable()->after('prod_sizes'),
            'prod_images'           => fn (Blueprint $table) => $table->json('prod_images')->nullable()->after('prod_colors'),
            'prod_preorder'         => fn (Blueprint $table) => $table->boolean('prod_preorder')->default(false)->after('prod_images'),
            'prod_status'           => fn (Blueprint $table) => $table->string('prod_status')->nullable()->after('prod_preorder'),
            'prod_preorder_info'    => fn (Blueprint $table) => $table->json('prod_preorder_info')->nullable()->after('prod_status'),
            'prod_stock_matrix'     => fn (Blueprint $table) => $table->json('prod_stock_matrix')->nullable()->after('prod_preorder_info'),
            'prod_details'          => fn (Blueprint $table) => $table->json('prod_details')->nullable()->after('prod_stock_matrix'),
            'prod_rating'           => fn (Blueprint $table) => $table->decimal('prod_rating', 3, 1)->nullable()->after('prod_details'),
            'prod_review_count'     => fn (Blueprint $table) => $table->integer('prod_review_count')->default(0)->after('prod_rating'),
            'prod_rating_breakdown' => fn (Blueprint $table) => $table->json('prod_rating_breakdown')->nullable()->after('prod_review_count'),
            'prod_reviews'          => fn (Blueprint $table) => $table->json('prod_reviews')->nullable()->after('prod_rating_breakdown'),
        ];

        foreach ($columns as $name => $define) {
            if (Schema::hasColumn('product', $name)) {
                continue;
            }

            Schema::table('product', function (Blueprint $table) use ($define) {
                $define($table);
            });
        }
    }

    public function down(): void
    {
        $columns = array_values(array_filter([
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
        ], fn ($name) => Schema::hasColumn('product', $name)));

        if ($columns === []) {
            return;
        }

        Schema::table('product', function (Blueprint $table) use ($columns) {
            $table->dropColumn($columns);
        });
    }
};
