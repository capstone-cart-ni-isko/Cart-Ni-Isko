<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/**
 * DOMAIN 7 (EMPLOYEE SCHEDULING).
 *
 * `schedules` replaces the old duty_shift table: one row is one stretch an
 * employee is prescheduled for. `sched_disabled` is the employee's own
 * "unavailable" flag (FLOW-EMP_SCHED-04); a null value means prescheduled.
 */
class Schedule extends Model
{
    protected $table = 'schedules';
    protected $primaryKey = 'sched_id';
    public $timestamps = false;

    protected $fillable = [
        'emp_id',
        'sched_time_start',
        'sched_time_end',
        'sched_created',
        'sched_disabled',
    ];

    protected $casts = [
        'sched_time_start' => 'datetime',
        'sched_time_end' => 'datetime',
        'sched_created' => 'datetime',
        'sched_disabled' => 'datetime',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
    }

    /** Minutes this block contributes toward the 180-minute weekly floor. */
    public function minutes(): int
    {
        if (! $this->sched_time_start || ! $this->sched_time_end) {
            return 0;
        }

        return max(0, (int) $this->sched_time_start->diffInMinutes($this->sched_time_end));
    }

    /** A block is staffed while it is prescheduled and not self-disabled. */
    public function isStaffed(): bool
    {
        return $this->sched_disabled === null;
    }

    public function covers($start, $end): bool
    {
        return $this->sched_time_start->lte($start) && $this->sched_time_end->gte($end);
    }
}
