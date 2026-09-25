<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the four signup details the edit-profile form must round-trip but the
 * SRS customer table never declared: username, campus, course and year level.
 *
 * Columns default to '' so every existing row keeps working untouched, and
 * the whole migration is guarded with hasTable/hasColumn so it is a no-op
 * where they already exist. No existing row is edited or added.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer')) return;

        Schema::table('customer', function (Blueprint $table) {
            if (! Schema::hasColumn('customer', 'cust_username')) {
                $table->string('cust_username', 64)->default('')->after('cust_nickname');
            }
            if (! Schema::hasColumn('customer', 'cust_campus')) {
                $table->string('cust_campus', 120)->default('')->after('cust_college');
            }
            if (! Schema::hasColumn('customer', 'cust_course')) {
                $table->string('cust_course', 120)->default('')->after('cust_campus');
            }
            if (! Schema::hasColumn('customer', 'cust_year')) {
                $table->string('cust_year', 64)->default('')->after('cust_course');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('customer')) return;

        Schema::table('customer', function (Blueprint $table) {
            foreach (['cust_username', 'cust_campus', 'cust_course', 'cust_year'] as $column) {
                if (Schema::hasColumn('customer', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
