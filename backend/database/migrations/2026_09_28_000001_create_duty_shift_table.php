<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Dated staff duty shifts (REQ-SS-01 / REQ-SS-02 / REQ-SS-03).
 *
 * Replaces the single emp_instore flag for scheduling: an employee counts
 * as in-store for an appointment slot only when one of their shifts on that
 * date covers the whole slot. Times are stored as zero-padded "HH:MM"
 * strings so they compare correctly as text on every database.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('duty_shift')) return;

        Schema::create('duty_shift', function (Blueprint $table) {
            $table->bigIncrements('shift_id');
            $table->unsignedBigInteger('emp_id');
            $table->date('shift_date');
            $table->string('shift_start', 5);
            $table->string('shift_end', 5);
            $table->string('shift_type')->default('DESK DUTY');
            $table->string('shift_location')->nullable();
            $table->timestamp('shift_created')->useCurrent();
            $table->unsignedBigInteger('created_by')->nullable();

            $table->foreign('emp_id')->references('emp_id')->on('employee')->cascadeOnDelete();
            $table->index(['shift_date', 'emp_id']);
        });

        // Supabase exposes public tables to its REST roles; like every other
        // table here, this one is reachable through the API only.
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE duty_shift ENABLE ROW LEVEL SECURITY');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('duty_shift');
    }
};
