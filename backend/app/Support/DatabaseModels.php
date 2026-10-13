<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Support\SystemSettings;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class Bag extends Model
{
    protected $table = 'bag';
    protected $primaryKey = 'bag_id';
    public $timestamps = false;

    protected $fillable = [
        'bag_id',
        'cust_id',
        'prodvar_id',
        'bag_qty',
        'bag_amount',
        'bag_placed',
        'bag_created',
        'bag_deleted',
    ];

    protected $casts = [
        'bag_qty' => 'integer',
        'bag_amount' => 'float',
        'bag_placed' => 'boolean',
        'bag_created' => 'datetime',
        'bag_deleted' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function prodvar()
    {
        return $this->belongsTo(Prodvar::class, 'prodvar_id', 'prodvar_id');
    }

    public function scopeLive($query)
    {
        return $query->whereNull('bag_deleted')->where('bag_placed', false);
    }
}

class CustLog extends Model
{
    protected $table = 'custlog';
    protected $primaryKey = 'custlog_id';
    public $timestamps = false;

    protected $fillable = [
        'custlog_id',
        'cust_id',
        'custlog_access',
        'custlog_endpoint',
        'custlog_created',
    ];

    protected $casts = ['custlog_created' => 'datetime'];
}

class CustNotif extends Model
{
    protected $table = 'custnotif';
    protected $primaryKey = 'custnotif_id';
    public $timestamps = false;

    protected $fillable = [
        'custnotif_id',
        'cust_id',
        'custnotif_created',
        'custnotif_read',
        'custnotif_msg',
        'custnotif_type',
    ];

    protected $casts = [
        'custnotif_created' => 'datetime',
        'custnotif_read' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }
}

class EmpLog extends Model
{
    protected $table = 'emplog';
    protected $primaryKey = 'emplog_id';
    public $timestamps = false;

    protected $fillable = [
        'emplog_id',
        'emp_id',
        'emplog_access',
        'emplog_endpoint',
        'emplog_created',
    ];

    protected $casts = ['emplog_created' => 'datetime'];
}

class EmpNotif extends Model
{
    protected $table = 'empnotif';
    protected $primaryKey = 'empnotif_id';
    public $timestamps = false;

    protected $fillable = [
        'empnotif_id',
        'emp_id',
        'empnotif_created',
        'empnotif_read',
        'empnotif_msg',
        'empnotif_type',
    ];

    protected $casts = [
        'empnotif_created' => 'datetime',
        'empnotif_read' => 'datetime',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
    }
}

class Item extends Model
{
    protected $table = 'items';
    protected $primaryKey = 'item_id';
    public $timestamps = false;
    public $incrementing = true;

    protected $fillable = [
        'item_id',
        'ord_id',
        'bag_id',
        'prod_id',
        'item_qty',
        'item_amount',
        'item_created',
    ];

    protected $casts = [
        'bag_id'       => 'integer',
        'item_qty'     => 'integer',
        'item_amount'  => 'float',
        'item_created' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }

    public function bag()
    {
        return $this->belongsTo(Bag::class, 'bag_id', 'bag_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }
}

class Parcel extends Model
{
    protected $table = 'parcel';
    protected $primaryKey = 'parcel_id';
    public $timestamps = false;

    protected $fillable = [
        'ord_id',
        'deliver_id',
        'pay_id',
        'parcel_created',
        'parcel_completed',
    ];

    protected $casts = [
        'parcel_created'   => 'datetime',
        'parcel_completed' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }

    public function delivery()
    {
        return $this->belongsTo(Delivery::class, 'deliver_id', 'deliver_id');
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class, 'pay_id', 'pay_id');
    }
}

class Payment extends Model
{
    protected $table = 'payment';
    protected $primaryKey = 'pay_id';
    public $timestamps = false;

    protected $fillable = [
        'pay_created',
        'pay_ref',
        'pay_given',
        'pay_due',
        'pay_change',
    ];

    protected $casts = [
        'pay_created' => 'datetime',
        'pay_given'   => 'float',
        'pay_due'     => 'float',
        'pay_change'  => 'float',
    ];
}

class Prodsales extends Model
{
    protected $table = 'prodsales';
    protected $primaryKey = 'prodsales_id';
    public $timestamps = false;

    protected $fillable = [
        'prodvar_id',
        'prodsales_date',
        'prodsales_qty',
        'prodsales_amount',
        'prodsales_bag',
        'prodsales_cust',
        'prodsales_guest',
        'prodsales_walkin',
        'prodsales_preorder',
        'prodsales_unsold',
        'prodsales_cancelled',
        'prodsales_wishlist',
        'prodsales_bueno_categ',
        'prodsales_college',
        'prodsales_created',
    ];

    protected $casts = [
        'prodsales_date' => 'date',
        'prodsales_created' => 'datetime',
        'prodsales_qty' => 'integer',
        'prodsales_amount' => 'float',
    ];

    public function prodvar()
    {
        return $this->belongsTo(Prodvar::class, 'prodvar_id', 'prodvar_id');
    }
}

class Prodvar extends Model
{
    protected $table = 'prodvar';
    protected $primaryKey = 'prodvar_id';
    public $timestamps = false;

    protected $fillable = [
        'prodvar_id',
        'prod_id',
        'prodvar_name',
        'prodvar_pic',
        'prodvar_stock',
        'prodvar_main',
        'prodvar_markup',
        'prodvar_options',
        'prodvar_preorder',
        'prodvar_created',
        'prodvar_disabled',
        'prodvar_deleted',
    ];

    protected $casts = [
        'prodvar_stock' => 'integer',
        'prodvar_main' => 'boolean',
        'prodvar_markup' => 'float',
        'prodvar_preorder' => 'boolean',
        'prodvar_created' => 'datetime',
        'prodvar_disabled' => 'datetime',
        'prodvar_deleted' => 'datetime',
    ];

    public function setProdvarOptionsAttribute($value)
    {
        if (is_array($value)) {
            ksort($value, SORT_NATURAL | SORT_FLAG_CASE);
            $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        $this->attributes['prodvar_options'] = $value === '' ? null : $value;
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }

    public function unitPrice(): float
    {
        $base = (float) ($this->product->prod_price ?? 0);

        return round($base + (float) ($this->prodvar_markup ?? 0), 2);
    }
}

class Review extends Model
{
    protected $table = 'reviews';
    protected $primaryKey = 'rev_id';
    public $timestamps = false;

    protected $fillable = [
        'cust_id',
        'prod_id',
        'rev_msg',
        'rev_created',
        'rev_approved',
    ];

    protected $casts = [
        'rev_created' => 'datetime',
        'rev_approved' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }

    public static function compose(int $rating, string $message): string
    {
        $rating = max(1, min(5, $rating));

        return $rating . '|' . $message;
    }

    public function rating(): int
    {
        $raw = (string) $this->rev_msg;
        $head = explode('|', $raw, 2)[0];

        return is_numeric($head) ? max(1, min(5, (int) $head)) : 0;
    }

    public function text(): string
    {
        $raw = (string) $this->rev_msg;
        $parts = explode('|', $raw, 2);

        return count($parts) === 2 ? $parts[1] : $raw;
    }

    public function isApproved(): bool
    {
        return $this->rev_approved !== null;
    }

    public function isRejected(): bool
    {
        return $this->rev_approved === null && str_starts_with((string) $this->rev_msg, '[REJECTED]');
    }
}

class Schedule extends Model
{
    protected $table = 'schedules';
    protected $primaryKey = 'sched_id';
    public $timestamps = false;

    protected $fillable = [
        'sched_id',
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

    public function minutes(): int
    {
        if (! $this->sched_time_start || ! $this->sched_time_end) {
            return 0;
        }

        return max(0, (int) $this->sched_time_start->diffInMinutes($this->sched_time_end));
    }

    public function isStaffed(): bool
    {
        return $this->sched_disabled === null;
    }

    public function covers($start, $end): bool
    {
        return $this->sched_time_start->lte($start) && $this->sched_time_end->gte($end);
    }

    public static function pendingReplacements(): int
    {
        try {
            return static::blocked()->count();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    protected static function blocked()
    {
        return static::query()->where(function ($query) {
            $query->whereNotNull('sched_disabled')
                ->orWhereNotIn('emp_id', static::availableEmployeeIds());
        });
    }

    public static function hasException(int $empId): bool
    {
        try {
            return static::where('emp_id', $empId)
                ->where(function ($query) {
                    $query->whereNotNull('sched_disabled')
                        ->orWhereNotIn('emp_id', static::availableEmployeeIds());
                })
                ->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function rosterFor(\Carbon\Carbon $day): \Illuminate\Support\Collection
    {
        try {
            return static::whereDate('sched_time_start', $day->toDateString())
                ->whereNull('sched_disabled')
                ->whereIn('emp_id', static::availableEmployeeIds())
                ->get();
        } catch (\Throwable $e) {
            return new \Illuminate\Support\Collection();
        }
    }

    public static function hasRosterFor(\Carbon\Carbon $day): bool
    {
        try {
            return static::whereDate('sched_time_start', $day->toDateString())->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function availableEmployeeIds(): \Illuminate\Support\Collection
    {
        return static::activeEmployeeQuery()
            ->where(Employee::availabilityColumn(), true)
            ->pluck('emp_id');
    }

    private static ?bool $hasEmpDisabled = null;

    public static function activeEmployeeQuery()
    {
        $query = Employee::whereNull('emp_deleted');

        if (self::$hasEmpDisabled === null) {
            try {
                self::$hasEmpDisabled = \Illuminate\Support\Facades\Schema::hasColumn('employee', 'emp_disabled');
            } catch (\Throwable $e) {
                self::$hasEmpDisabled = false;
            }
        }

        if (self::$hasEmpDisabled) {
            $query->whereNull('emp_disabled');
        }

        return $query;
    }
}

class Setting
{
    public static function getValue(string $key, $default = null)
    {
        return SystemSettings::get($key, $default);
    }

    public static function setValue(string $key, $value): void
    {
        SystemSettings::set($key, $value);
    }

    public static function all(): array
    {
        return SystemSettings::all();
    }

    public static function fill(array $values): void
    {
        SystemSettings::putMany($values);
    }
}

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}

class Wishlist extends Model
{
    protected $table = 'wishlist';
    protected $primaryKey = 'wish_id';
    public $timestamps = false;

    protected $fillable = [
        'wish_id',
        'cust_id',
        'prod_id',
        'wish_created',
        'wish_hidden',
    ];

    protected $casts = [
        'wish_created' => 'datetime',
        'wish_hidden'  => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }

    public function scopeVisible($query)
    {
        return $query->whereNull('wish_hidden');
    }
}
class_alias(Visit::class, 'App\Models\Appointment');
