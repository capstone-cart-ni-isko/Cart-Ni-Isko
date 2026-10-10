<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Support\SystemSettings;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Supporting tables behind the seven system-new.docx models.
 *
 * system-new.docx MODELS lists exactly Customer, Delivery, Employee, Order,
 * Pickup, Product and Visit, so these legacy classes no longer live in a file
 * of their own under app/Models. They keep the App\Models namespace (nothing
 * had to change at any call site) and are loaded by the fallback autoloader in
 * AppServiceProvider::register(). Nothing here is ever instantiated through a
 * table the seven owners do not cover - the owning model exposes it as a
 * relation (see Customer::bag(), Employee::schedules(), Order::items(), ...).
 *
 * Rules 13-15 (BAG): one row per customer + product variation, with the
 * number of pieces. `bag_placed` flips to true once the row has been cut
 * into an order; `bag_deleted` is the soft delete REQ-BAG-02 asks for.
 */
class Bag extends Model
{
    protected $table = 'bag';
    protected $primaryKey = 'bag_id';
    public $timestamps = false;

    protected $fillable = [
        // `bag_id` has no sequence on the live table, so writers pass the
        // number from App\Support\IdAllocator::next().
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

    /** Still on the shelf, not yet checked out and not removed. */
    public function scopeLive($query)
    {
        return $query->whereNull('bag_deleted')->where('bag_placed', false);
    }
}

/** DOMAIN 32 / FLOW-ACCESS_LOG-01: immutable customer access log rows. */
class CustLog extends Model
{
    protected $table = 'custlog';
    protected $primaryKey = 'custlog_id';
    public $timestamps = false;

    protected $fillable = [
        // `custlog_id` has no sequence on the live table, so writers pass
        // the number from App\Support\IdAllocator::next().
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
        // `custnotif_id` has no sequence on the live table, so writers pass
        // the number from App\Support\IdAllocator::next().
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

/** DOMAIN 32 / FLOW-ACCESS_LOG-04: immutable employee access log rows. */
class EmpLog extends Model
{
    protected $table = 'emplog';
    protected $primaryKey = 'emplog_id';
    public $timestamps = false;

    protected $fillable = [
        // `emplog_id` has no sequence on the live table, so writers pass
        // the number from App\Support\IdAllocator::next().
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
        // `empnotif_id` has no sequence on the live table, so writers pass
        // the number from App\Support\IdAllocator::next().
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

    // Live schema columns: item_id, ord_id, bag_id, item_created
    // (quantity/amount live on the linked bag row; the item_qty/item_amount/
    // prod_id spellings are kept fillable for the legacy sqlite test schema).
    // `item_id` is fillable because the live table has no sequence for it:
    // writers must pass the number from App\Support\IdAllocator::next().
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

    /**
     * FLOW-CHECKOUT-02 / REQ-BAG-01: an order line is cut from one bag row.
     * OrdersAPI's fulfil/restock/bump paths walk items -> bag -> prodvar, so
     * without this relation every scan hit `RelationNotFoundException` (500).
     */
    public function bag()
    {
        return $this->belongsTo(Bag::class, 'bag_id', 'bag_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }
}

/**
 * Links an order to a delivery row.
 * Live schema: parcel_id, ord_id, deliver_id, pay_id, parcel_created, parcel_completed
 */
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

/**
 * The payment table records every completed payment.
 * Live schema: pay_id, pay_created, pay_ref, pay_given, pay_due, pay_change
 */
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

/**
 * DOMAIN 9 / DOMAIN 14 metric source: one rolled-up row per product
 * variation per day. Aggregates are maintained by OrdersAPI/OrdersAPI whenever
 * an order is placed, cancelled or claimed.
 */
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
        // `prodvar_id` has no sequence on the live table either, so the key is
        // allocated in application code (App\Support\IdAllocator) and must be
        // mass-assignable - otherwise it is dropped and the INSERT fails on a
        // NOT NULL violation whenever a variation is created.
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

    /**
     * A product can variate along several axes at once - (cream, medium) is one
     * variation, (black, metallic) another - so the {axis: value} pairs behind
     * a row travel in `prodvar_options`. The cell is written as a JSON string
     * by ProductsAPI::encodeOptions and read back as a map by decodeOptions;
     * this cast only keeps a raw array usable on the way in, so a caller may
     * hand the model the map directly.
     */
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

    /** What the customer actually pays for one piece of this variation. */
    public function unitPrice(): float
    {
        $base = (float) ($this->product->prod_price ?? 0);

        return round($base + (float) ($this->prodvar_markup ?? 0), 2);
    }
}

/**
 * DOMAIN 13 / DOMAIN 23 reviews.
 *
 * The schema carries no rating column, so the rating travels inside `rev_msg`
 * as a leading `<rating>|` token. ProductsAPI encodes on write and decodes on
 * read; nothing else in the system ever touches `rev_msg` raw.
 */
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

    /** Stores "<rating>|<message>". */
    public static function compose(int $rating, string $message): string
    {
        $rating = max(1, min(5, $rating));

        return $rating . '|' . $message;
    }

    /** The 1-5 rating carried by this review. */
    public function rating(): int
    {
        $raw = (string) $this->rev_msg;
        $head = explode('|', $raw, 2)[0];

        return is_numeric($head) ? max(1, min(5, (int) $head)) : 0;
    }

    /** The free-text half of the review. */
    public function text(): string
    {
        $raw = (string) $this->rev_msg;
        $parts = explode('|', $raw, 2);

        return count($parts) === 2 ? $parts[1] : $raw;
    }

    /** REQ-MANAGE_REV-02: only approved reviews reach customers. */
    public function isApproved(): bool
    {
        return $this->rev_approved !== null;
    }

    /** REQ-MANAGE_REV-03: rejected rows stay for audit under a marker. */
    public function isRejected(): bool
    {
        return $this->rev_approved === null && str_starts_with((string) $this->rev_msg, '[REJECTED]');
    }
}

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

    // ==========================================
    // ROSTER QUERIES (business rule 10 / REQ-AB-03 / REQ-EMP_SCHED-06)
    // ==========================================

    /*
        REQ-SS-03: how many blocks still need a replacement because the
        assigned employee is no longer available. Derived, never stored.
        Tolerates a connection without the schedules table so the slot
        calendar still answers there.
    */
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
        `schedules` stores one timestamp pair per block, so the day is the
        calendar date of the block's start. An empty result means no available
        employee holds a block that day; see hasRosterFor for the distinction
        between "not rostered" and "not staffed".
    */
    public static function rosterFor(\Carbon\Carbon $day): \Illuminate\Support\Collection
    {
        try {
            return static::whereDate('sched_time_start', $day->toDateString())
                ->whereIn('emp_id', static::availableEmployeeIds())
                ->get();
        } catch (\Throwable $e) {
            return new \Illuminate\Support\Collection();
        }
    }

    // Does the shop hold any duty block for that day, whoever staffs it? False
    // means the day was never rostered, so the day-wide in-store count is the
    // answer for every slot on it.
    public static function hasRosterFor(\Carbon\Carbon $day): bool
    {
        try {
            return static::whereDate('sched_time_start', $day->toDateString())->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    // The staff members currently counted as in-store
    public static function availableEmployeeIds(): \Illuminate\Support\Collection
    {
        return static::activeEmployeeQuery()
            ->where(Employee::availabilityColumn(), true)
            ->pluck('emp_id');
    }

    /**
     * The live Supabase `employee` table has no `emp_disabled` column (it
     * ships emp_deleted / emp_suspended instead), while the legacy/sqlite
     * schema the test suite runs on still carries it - same probe as
     * Controller::activeEmployeeQuery(). Filtering on a missing column would
     * kill the whole roster query, so the filter only applies when it exists.
     */
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

/**
 * Compatibility facade over SystemSettings.
 *
 * system-new.docx SCHEMA has no SETTINGS table, so nothing is ever read from
 * or written to the database here - the settings document lives on disk.
 * Every legacy `Setting::getValue()` / `Setting::setValue()` call site keeps
 * working unchanged.
 */
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

    /** Bulk read for the settings screen. */
    public static function all(): array
    {
        return SystemSettings::all();
    }

    /** Bulk write for the settings screen. */
    public static function fill(array $values): void
    {
        SystemSettings::putMany($values);
    }
}

// use Illuminate\Contracts\Auth\MustVerifyEmail;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}

/**
 * DOMAIN 24 (WISHLIST). REQ-WISHLIST-02 asks for a soft delete, so removal
 * stamps `wish_hidden` instead of dropping the row; display queries only
 * rows WHERE wish_hidden IS NULL (the live soft-delete column) ordered by
 * wish_created DESC (FLOW-WISHLIST-03).
 */
class Wishlist extends Model
{
    protected $table = 'wishlist';
    protected $primaryKey = 'wish_id';
    public $timestamps = false;

    // Live schema columns: wish_id, cust_id, prod_id, wish_created, wish_hidden
    // `wish_id` has no sequence on the live table, so writers pass the number
    // from App\Support\IdAllocator::next().
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

    /** FLOW-WISHLIST-03: visible = not soft-hidden yet. */
    public function scopeVisible($query)
    {
        return $query->whereNull('wish_hidden');
    }
}

// Legacy name for the Visit model (app/Models/Visit.php), kept so pre-refactor
// callers such as Controllers/Backups resolve instead of fataling.
class_alias(Visit::class, 'App\Models\Appointment');
