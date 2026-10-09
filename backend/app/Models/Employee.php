<?php
namespace App\Models;
use App\Support\EmployeePassword;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Schema;

class Employee extends Authenticatable
{
    // Define the table name, primary key, and timestamps
    protected $table = 'employee';
    protected $primaryKey = 'emp_id';
    public $timestamps = false;

    /**
     * DOMAIN 6 / REQ-EMP_ENROLL-03 - every password that reaches the
     * `employee` table is bcrypt-digested first. The guard lives on the model
     * so enrollment, seeding, console commands and any future writer all hash
     * the same way, and an already-digested value (including a temporary
     * password, which carries its own marker inside the digest) is left alone.
     */
    protected static function booted(): void
    {
        static::saving(function (Employee $employee) {
            $plain = (string) $employee->emp_password;

            if ($plain !== '' && ! EmployeePassword::isHashed($plain)) {
                $employee->emp_password = EmployeePassword::make($plain);
            }
        });
    }

    // system-new.docx SCHEMA -> EMPLOYEE
    protected $fillable = [
        'emp_givname',
        'emp_surname',
        'emp_email',
        'emp_phone',
        'emp_password',
        'emp_callcode',
        'emp_pronoun',
        'emp_categ',
        'emp_avatar',
        'emp_backup_phone',
        'emp_backup_email',
        'emp_backup_ques',
        'emp_backup_answer',
        'emp_backup_code',
        'emp_created',
        'emp_deleted',
        'emp_suspended',
        'emp_darkmode',
        'emp_login_active',
        'emp_login_failed',
        'emp_last_logout',
        'emp_notif_appointremind',
        'emp_notif_email',
        'emp_present',
        // The legacy/fixture schema spells the same flag `emp_instore`; the
        // availability layer writes whichever column the connected schema
        // actually carries (see availabilityColumn()).
        'emp_instore',
        'emp_unread',
    ];

    protected $hidden = [
        'emp_password',
        'emp_backup_answer',
        'emp_login_active',
    ];

    protected $casts = [
        'emp_created' => 'datetime',
        'emp_deleted' => 'datetime',
        'emp_suspended' => 'datetime',
        'emp_darkmode' => 'boolean',
        'emp_login_failed' => 'datetime',
        'emp_last_logout' => 'datetime',
        'emp_notif_email' => 'boolean',
        'emp_present' => 'boolean',
        'emp_unread' => 'integer',
    ];

    /**
     * Rule 32: employees are "staff", "admin" or "super admin".
     *
     * The system-new SCHEMA names the category `emp_categ`; the pre-migration
     * fixture (and older rows) still carry it as `emp_type`, so reading either
     * keeps the rank identical wherever the account is judged - the same
     * fallback EnsureRole already applies to every route guard.
     */
    public function category(): string
    {
        return strtolower((string) ($this->emp_categ ?: $this->emp_type));
    }

    /*
        AVAILABILITY (system-new SCHEMA `emp_present` / legacy `emp_instore`).

        The live employee table carries `emp_present` and no `emp_instore`;
        the pre-migration fixture phpunit runs on is the exact opposite. Every
        availability read and write goes through these three helpers so the
        same code answers correctly on both connections - writing the column
        the schema does not have would fail the statement, and reading the
        missing one would always answer false.
    */
    private static ?bool $hasPresentColumn = null;

    /** The column this connection stores the in-store flag in. */
    public static function availabilityColumn(): string
    {
        if (self::$hasPresentColumn === null) {
            try {
                self::$hasPresentColumn = Schema::hasColumn('employee', 'emp_present');
            } catch (\Throwable $e) {
                return 'emp_instore'; // schema unreadable: guess, but do not cache the guess
            }
        }

        return self::$hasPresentColumn ? 'emp_present' : 'emp_instore';
    }

    /** Is this employee currently counted as in-store? */
    public function inStore(): bool
    {
        return (bool) $this->getAttribute(self::availabilityColumn());
    }

    /** Flip in-store availability on whichever column this connection uses. */
    public function setInStore(bool $inStore): void
    {
        $column = self::availabilityColumn();

        if ((bool) $this->getAttribute($column) === $inStore) return;

        $this->forceFill([$column => $inStore])->save();
    }

    public function isSuperAdmin(): bool
    {
        return str_contains($this->category(), 'super');
    }

    public function isAdmin(): bool
    {
        return str_contains($this->category(), 'admin');
    }

    public function isActive(): bool
    {
        return $this->emp_deleted === null && $this->emp_suspended === null;
    }

    /*
        system-new.docx MODELS: the supporting tables keyed by `emp_id`
        aggregate onto the employee model (they stay in App\Support
        DatabaseModels and are touched only through DatabaseAPI, rule 80).
    */
    public function schedules()
    {
        return $this->hasMany(Schedule::class, 'emp_id', 'emp_id');
    }

    public function accessLog()
    {
        return $this->hasMany(EmpLog::class, 'emp_id', 'emp_id');
    }

    public function notifications()
    {
        return $this->hasMany(EmpNotif::class, 'emp_id', 'emp_id');
    }

    public function visits()
    {
        return $this->hasMany(Visit::class, 'emp_id', 'emp_id');
    }
}
