<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create the per-variant daily sales ledger (prodsales).
 *
 * The table already exists in Supabase, so this is a no-op there; it only
 * fills the gap on a fresh local SQLite database, where the catalog query
 * joins prodsales for "units sold" and fails without it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('prodsales')) {
            return;
        }

        Schema::create('prodsales', function (Blueprint $table) {
            $table->bigIncrements('prodsales_id');
            $table->unsignedBigInteger('prodvar_id');
            $table->date('prodsales_date');
            $table->integer('prodsales_qty')->default(0);
            $table->decimal('prodsales_amount', 12, 2)->default(0);
            $table->integer('prodsales_bag')->default(0);
            $table->integer('prodsales_cust')->default(0);
            $table->integer('prodsales_guest')->default(0);
            $table->integer('prodsales_walkin')->default(0);
            $table->integer('prodsales_preorder')->default(0);
            $table->integer('prodsales_unsold')->default(0);
            $table->integer('prodsales_cancelled')->default(0);
            $table->integer('prodsales_wishlist')->default(0);
            $table->string('prodsales_bueno_categ')->nullable();
            $table->string('prodsales_college')->nullable();
            $table->timestampTz('prodsales_created')->useCurrent();

            $table->index(['prodvar_id', 'prodsales_date']);
        });
    }

    public function down(): void
    {
        // Never drop: on Supabase this table predates the migration.
    }
};
