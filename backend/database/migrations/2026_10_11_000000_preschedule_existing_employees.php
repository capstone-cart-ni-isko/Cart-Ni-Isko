<?php

use App\Models\Employee;
use App\Models\Schedule;
use App\Support\IdAllocator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Give every employee that already exists a baseline schedule.
 *
 * RULE 46 / FLOW-EMP_ENROLL-05 / REQ-EMP_ENROLL-06: every employee must be
 * prescheduled, and must hold at least 180 minutes in the week. The accounts
 * restored onto this database were created before the enrollment path learned
 * to write their block, so they hold none at all - and with an empty
 * `schedules` table `DayRoster` falls back to the day-wide headcount instead
 * of any real block, which is what hides the gap.
 *
 * The block written here is the SAME one UserAPI::prescheduleNewEmployee
 * writes on enrollment (an unbroken block from now for seven days = 10,080
 * minutes, far past the 180-minute floor), so a back-filled employee and a
 * freshly enrolled one are indistinguishable to the roster.
 *
 * AFFECTED SCOPE - this migration writes ROWS only. No table is created, no
 * column is altered and no existing row is read-then-rewritten, so every
 * other table and every already-stored value is left exactly as it is.
 *
 * IDEMPOTENT: an employee who already holds at least one `schedules` row is
 * skipped, so re-running this migration never doubles a block and never
 * extends one that a super admin has since trimmed.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('schedules') || ! Schema::hasTable('employee')) {
            return;
        }

        // Only the employees with no preschedule at all need one. An employee
        // who already holds a block (enrolled after the fix, or re-scheduled
        // by a super admin) is deliberately left alone.
        $withBlocks = Schedule::query()->pluck('emp_id')->unique()->all();
        $pending = Employee::query()
            ->whereNotIn('emp_id', $withBlocks ?: [0])
            ->orderBy('emp_id')
            ->get(['emp_id']);

        foreach ($pending as $employee) {
            $start = now()->startOfMinute();

            DB::table('schedules')->insert([
                // SYSTEM RULE / App\Support\IdAllocator: `schedules.sched_id`
                // is a bare bigint NOT NULL primary key with no sequence, so
                // the number is allocated here - the same way
                // SystemAPI::createShift and UserAPI::prescheduleNewEmployee
                // allocate theirs.
                'sched_id'         => IdAllocator::next('schedules', 'sched_id'),
                'emp_id'           => (int) $employee->emp_id,
                'sched_time_start' => $start,
                'sched_time_end'   => $start->copy()->addDays(7),
                'sched_created'    => now(),
                // null = prescheduled / available (see the Schedule model).
                'sched_disabled'   => null,
            ]);
        }
    }

    public function down(): void
    {
        // The back-filled blocks are indistinguishable from the ones the
        // enrollment path writes, so they are never removed here: rolling
        // back would strip the schedule of every employee enrolled since.
    }
};
