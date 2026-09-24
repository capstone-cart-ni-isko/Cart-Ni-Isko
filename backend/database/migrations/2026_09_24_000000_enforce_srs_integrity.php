<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('employee')->whereNull('emp_phone')->exists()) {
            throw new RuntimeException('Employee phone numbers must be completed before enforcing NOT NULL.');
        }

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE customer ALTER COLUMN cust_country SET NOT NULL');
            DB::statement('ALTER TABLE employee ALTER COLUMN emp_phone SET NOT NULL');
            DB::statement('ALTER TABLE orders ALTER COLUMN cust_id SET NOT NULL');
            DB::statement('ALTER TABLE pickup ALTER COLUMN appoint_id SET NOT NULL');
            DB::statement('ALTER TABLE orders ALTER COLUMN ord_rating TYPE BIGINT');
            DB::statement('ALTER TABLE pickup ALTER COLUMN pickup_created SET DEFAULT CURRENT_TIMESTAMP');
            DB::statement('ALTER TABLE parcel ALTER COLUMN parcel_created SET DEFAULT CURRENT_TIMESTAMP');
            DB::statement('CREATE UNIQUE INDEX product_prod_tag_unique ON product (prod_tag)');
            DB::statement('CREATE UNIQUE INDEX product_prod_name_unique ON product (prod_name)');

            DB::statement('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon');
            DB::statement('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated');
            DB::statement('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM service_role');
        } else {
            Schema::table('customer', function (Blueprint $table) {
                $table->string('cust_country')->default('')->change();
            });
            Schema::table('employee', function (Blueprint $table) {
                $table->string('emp_phone')->change();
            });
            Schema::table('orders', function (Blueprint $table) {
                $table->bigInteger('cust_id')->change();
                $table->bigInteger('ord_rating')->default(0)->change();
            });
            Schema::table('pickup', function (Blueprint $table) {
                $table->bigInteger('appoint_id')->change();
                $table->timestamp('pickup_created')->useCurrent()->change();
            });
            Schema::table('parcel', function (Blueprint $table) {
                $table->timestamp('parcel_created')->useCurrent()->change();
            });
            Schema::table('product', function (Blueprint $table) {
                $table->unique('prod_tag');
                $table->unique('prod_name');
            });
        }

        if (! Schema::hasColumn('employee', 'emp_college')) {
            Schema::table('employee', function (Blueprint $table) {
                $table->string('emp_college')->nullable()->after('emp_studnum');
                $table->string('emp_program')->nullable()->after('emp_college');
                $table->unsignedTinyInteger('emp_year')->nullable()->after('emp_program');
                $table->string('emp_bloc')->nullable()->after('emp_year');
            });
        }
    }

    public function down(): void
    {
        // Security revocations and shared Supabase data are intentionally not rolled back.
    }
};
