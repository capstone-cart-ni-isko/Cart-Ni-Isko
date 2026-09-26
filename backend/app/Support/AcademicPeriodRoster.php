<?php

namespace App\Support;

use App\Models\DutyShift;
use App\Models\Employee;
use App\Models\Setting;
use Carbon\Carbon;

/**
 * REQ-SS-01: rebuild the shop's baseline duty roster when an academic period
 * opens.
 *
 * Every active employee is set back to Available and given one duty_shift block
 * per day covering the shop's standard operating hours, so the schedule
 * calendar opens up all timeslots by default.
 *
 * Two guards stop it from ever firing by accident. The period start comes from
 * the settings table and falls back to a code default that sits in the future,
 * so nothing happens until a real term is configured. A marker file then
 * records the period it already applied, so the job runs once per term and the
 * settings table keeps its zero-row baseline (no row is inserted here).
 *
 * An employee who logged an unavailability keeps it: a block whose assignee is
 * not emp_instore is that employee's explicit exception, so both the block and
 * the employee are left alone.
 */
class AcademicPeriodRoster
{
    // Days of roster the rebuild covers. The schema carries no term-end column,
    // so the horizon is fixed here rather than derived.
    const DAYS = 14;

    const DEFAULT_PERIOD = '2027-08-02';
    const DEFAULT_HOURS = '08:00 - 18:00';

    /**
     * Apply the roster for the current term.
     *
     * Returns a small summary: whether anything ran, why not, and the counts.
     */
    public static function apply(): array
    {
        $period = (string) Setting::getValue('academic_period_start', self::DEFAULT_PERIOD);

        if (Carbon::parse($period)->startOfDay()->isFuture()) {
            return self::skipped('the term has not opened yet', $period);
        }

        if (trim((string) @file_get_contents(self::marker())) === $period) {
            return self::skipped('this term is already applied', $period);
        }

        $summary = ['reset' => 0, 'excepted' => 0, 'created' => 0];

        foreach (self::activeEmployees() as $employee) {
            $summary = self::rosterEmployee($employee, $summary);
        }

        @file_put_contents(self::marker(), $period);

        return ['applied' => true, 'period' => $period] + $summary;
    }

    // An active employee keeps an unavailability only when a block records it
    private static function rosterEmployee(Employee $employee, array $summary): array
    {
        if (DutyShift::hasException($employee->emp_id)) {
            return ['excepted' => $summary['excepted'] + 1] + $summary;
        }

        $employee->update(['emp_instore' => true]);
        $summary['reset']++;

        [$open, $close] = self::operatingHours();

        foreach (self::rosterDays() as $day) {
            $exists = DutyShift::where('emp_id', $employee->emp_id)
                ->where('shift_date', $day)
                ->exists();

            if ($exists) continue;

            DutyShift::create([
                'emp_id'         => $employee->emp_id,
                'shift_date'     => $day,
                'shift_start'    => $open,
                'shift_end'      => $close,
                'shift_type'     => 'DESK DUTY',
                'shift_location' => 'Main Counter',
                'shift_created'  => now(),
                'created_by'     => null,
            ]);
            $summary['created']++;
        }

        return $summary;
    }

    // Nobody disabled and nobody soft-deleted (REQ-UM-03 keeps the row)
    private static function activeEmployees()
    {
        return Employee::whereNull('emp_disabled')
            ->whereNull('emp_deleted')
            ->get();
    }

    // Today's dates as 'Y-m-d' strings, for the rolling roster window
    private static function rosterDays(): array
    {
        $first = now()->startOfDay();
        $last = $first->copy()->addDays(self::DAYS - 1);
        $days = [];

        for ($day = $first->copy(); $day->lessThanOrEqualTo($last); $day->addDay()) {
            $days[] = $day->toDateString();
        }

        return $days;
    }

    // The shop's standard operating hours as ['08:00', '18:00']
    private static function operatingHours(): array
    {
        $hours = array_map('trim', explode('-', (string) Setting::getValue('operating_hours', self::DEFAULT_HOURS)));

        return [$hours[0] ?: '08:00', $hours[1] ?? '18:00'];
    }

    private static function marker(): string
    {
        return storage_path('framework/academic-period-applied');
    }

    private static function skipped(string $reason, string $period): array
    {
        return [
            'applied'  => false,
            'reason'   => $reason,
            'period'   => $period,
            'reset'    => 0,
            'excepted' => 0,
            'created'  => 0,
        ];
    }
}
