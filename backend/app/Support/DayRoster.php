<?php

namespace App\Support;

use App\Models\DutyShift;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * REQ-AB-03 / REQ-SS-03: one day's staffing, loaded once and reused for every
 * slot of the schedule calendar.
 *
 * A slot's headcount only counts the employees whose duty block spans it, so a
 * day with one officer in the morning and two in the afternoon reports a
 * different number for each block. When the shop has not rostered the day at
 * all, the day-wide in-store count answers for every slot instead, so booking
 * still works before anyone builds a roster.
 */
class DayRoster
{
    private function __construct(
        private readonly Collection $blocks,
        private readonly bool $rostered,
        private readonly int $dayWide,
    ) {
    }

    public static function for(Carbon $day): self
    {
        return new self(
            DutyShift::rosterFor($day),
            DutyShift::hasRosterFor($day),
            DutyShift::availableEmployeeIds()->count(),
        );
    }

    /** How many in-store employees cover this block of the calendar. */
    public function headcount(Carbon $start, Carbon $end): int
    {
        if ($this->dayWide === 0) return 0;
        if (! $this->rostered) return $this->dayWide;

        return $this->blocks
            ->filter(fn (DutyShift $block) => $block->covers($start, $end))
            ->count();
    }
}
