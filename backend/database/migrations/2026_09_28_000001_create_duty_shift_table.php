<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

/**
 * The duty_shift table: one block of duty for one staff member.
 *
 * shift_start and shift_end are 'HH:MM' 24-hour strings. The table carries no
 * status column, so a block's status (SCHEDULED / ACTIVE / COMPLETED /
 * PENDING REPLACEMENT) is derived at read time from the assignee's
 * emp_instore flag and the block window.
 */
return new class extends Migration
{
    public function up(): void
    {
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

            $table->foreign('emp_id')->references('emp_id')->on('employee')->onDelete('cascade');
            $table->index(['shift_date', 'emp_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('duty_shift');
    }
};
