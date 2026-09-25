<?php

    namespace App\Models;

    use Carbon\Carbon;
    use Illuminate\Database\Eloquent\Model;
    use Illuminate\Support\Collection;

    class DutyShift extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'duty_shift';
        protected $primaryKey = 'shift_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
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
            'shift_date' => 'date:Y-m-d',
        ];

        public function employee()
        {
            return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
        }

        /** Shifts of active (not disabled/deleted) employees on one date. */
        public static function activeOn(string $date): Collection
        {
            return static::whereDate('shift_date', $date)
                ->whereHas('employee', fn ($q) => $q->whereNull('emp_disabled')->whereNull('emp_deleted'))
                ->get(['emp_id', 'shift_start', 'shift_end']);
        }

        /**
         * Distinct employees whose shift covers the whole [start, end) block.
         * Pass a preloaded activeOn() collection to score many slots cheaply.
         */
        public static function staffCovering(Carbon $start, Carbon $end, ?Collection $shifts = null): int
        {
            $shifts ??= static::activeOn($start->format('Y-m-d'));
            $from = $start->format('H:i');
            $to = $end->format('H:i');

            return $shifts
                ->filter(fn ($s) => $s->shift_start <= $from && $s->shift_end >= $to)
                ->pluck('emp_id')
                ->unique()
                ->count();
        }
    }
