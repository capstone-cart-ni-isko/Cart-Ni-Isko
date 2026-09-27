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

        /** The moment this shift begins (shift_date + shift_start). */
        public function startsAt(): Carbon
        {
            return Carbon::parse($this->shift_date->format('Y-m-d') . ' ' . $this->shift_start);
        }

        /** The moment this shift ends (shift_date + shift_end). */
        public function endsAt(): Carbon
        {
            return Carbon::parse($this->shift_date->format('Y-m-d') . ' ' . $this->shift_end);
        }

        /**
         * REQ-SS-03: a shift is PENDING REPLACEMENT once its assignee can no
         * longer work it (account disabled or deleted). activeOn() already
         * leaves such shifts out of the slot headcount.
         */
        public function isPendingReplacement(): bool
        {
            $employee = $this->employee;

            return $employee === null
                || $employee->emp_disabled !== null
                || $employee->emp_deleted !== null;
        }

        /** Upcoming shifts (today onward) that are PENDING REPLACEMENT. */
        public static function pendingReplacements(): int
        {
            return static::whereDate('shift_date', '>=', now()->format('Y-m-d'))
                ->where(fn ($q) => $q
                    ->whereDoesntHave('employee')
                    ->orWhereHas('employee', fn ($e) => $e->whereNotNull('emp_disabled')->orWhereNotNull('emp_deleted')))
                ->count();
        }
    }
