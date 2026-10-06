<?php
namespace App\Models;
use App\Support\EmployeePassword;
use Illuminate\Foundation\Auth\User as Authenticatable;

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
}
