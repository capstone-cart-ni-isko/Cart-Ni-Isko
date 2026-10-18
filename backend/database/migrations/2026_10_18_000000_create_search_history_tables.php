<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('empsearch')) {
            Schema::create('empsearch', function (Blueprint $table) {
                $table->bigIncrements('empsearch_id');
                $table->unsignedBigInteger('emp_id');
                $table->timestampTz('empsearch_created')->useCurrent();
                $table->text('empsearch_query');

                $table->foreign('emp_id')->references('emp_id')->on('employee')->onDelete('cascade');
                $table->index(['emp_id', 'empsearch_created']);
            });
        }

        if (!Schema::hasTable('custsearch')) {
            Schema::create('custsearch', function (Blueprint $table) {
                $table->bigIncrements('custsearch_id');
                $table->unsignedBigInteger('cust_id');
                $table->timestampTz('custsearch_created')->useCurrent();
                $table->text('custsearch_query');

                $table->foreign('cust_id')->references('cust_id')->on('customer')->onDelete('cascade');
                $table->index(['cust_id', 'custsearch_created']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('custsearch');
        Schema::dropIfExists('empsearch');
    }
};
