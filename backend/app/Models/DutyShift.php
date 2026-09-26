<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

// A duty block assigned to a staff member (table duty_shift).
// The table holds no status column (schema kept as-is per G6a), so the
// status is derived at read time from the assignee's availability and the
// block window. The window is stored as 'HH:MM' 24-hour strings.
class DutyShift extends Model
{
    protected $table = 'duty_shift';
    protected $primaryKey = 'shift_id';
    public $timestamps = false;

    protected $fillable = [
        'emp_id',
        'shift_date',
        'shift_start',
        'shift_end',
        'shift_type',
        'shift_location',
        'shift_created',
        'created_by',
    ];

    protected $casts = [
        'shift_id'      => 'integer',
        'emp_id'        => 'integer',
        'created_by'    => 'integer',
        'shift_created' => 'datetime',
    ];

    // The staff member holding this block
    public function employee()
    {
        return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
    }

    // The block start as a real date. shift_date is a date and shift_start a
    // 'HH:MM' string, so the two are only comparable once joined here.
    public function startsAt(): Carbon
    {
        return Carbon::parse($this->shift_date . ' ' . $this->shift_start);
    }

    // The block end as a real date
    public function endsAt(): Carbon
    {
        return Carbon::parse($this->shift_date . ' ' . $this->shift_end);
    }

    // Does this block cover a whole slot of the calendar? REQ-AB-03 counts
    // only the employees whose block spans the slot they are staffing.
    public function covers(Carbon $start, Carbon $end): bool
    {
        return $this->startsAt()->lessThanOrEqualTo($start)
            && $this->endsAt()->greaterThanOrEqualTo($end);
    }

    // REQ-SS-03: how many blocks still need a replacement because the
    // assigned employee is no longer available. Derived, never stored.
    // Tolerates a connection without the duty_shift table (same guard as
    // Setting::getValue) so the slot calendar still answers there.
    public static function pendingReplacements(): int
    {
        try {
            return static::whereNotIn('emp_id', static::availableEmployeeIds())->count();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /*
        REQ-SS-01: an employee who already holds a block they are not
        available for has logged an explicit exception, so the academic-period
        job leaves that employee alone. Returns false on a connection without
        the table, which lets the job treat everyone as up for renewal.
    */
    public static function hasException(int $empId): bool
    {
        try {
            return static::where('emp_id', $empId)
                ->whereNotIn('emp_id', static::availableEmployeeIds())
                ->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /*
        REQ-AB-03 / REQ-SS-03: the available duty blocks of one calendar day.
        An empty result means no available employee holds a block that day; see
        hasRosterFor for the distinction between "not rostered" and "not
        staffed".
    */
    public static function rosterFor(Carbon $day): Collection
    {
        try {
            return static::where('shift_date', $day->toDateString())
                ->whereIn('emp_id', static::availableEmployeeIds())
                ->get();
        } catch (\Throwable $e) {
            return new Collection();
        }
    }

    // Does the shop hold any duty block for that day, whoever staffs it? False
    // means the day was never rostered, so the day-wide in-store count is the
    // answer for every slot on it.
    public static function hasRosterFor(Carbon $day): bool
    {
        try {
            return static::where('shift_date', $day->toDateString())->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    // The staff members currently counted as in-store
    public static function availableEmployeeIds(): Collection
    {
        return Employee::where('emp_instore', true)
            ->whereNull('emp_disabled')
            ->whereNull('emp_deleted')
            ->pluck('emp_id');
    }
}
