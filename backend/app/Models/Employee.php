<?php
namespace App\Models;
use Illuminate\Foundation\Auth\User as Authenticatable;

class Employee extends Authenticatable
{
    // Define the table name, primary key, and timestamps
    protected $table = 'employee';
    protected $primaryKey = 'emp_id';
    public $timestamps = false;

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

    /** Rule 32: employees are "staff", "admin" or "super admin". */
    public function isSuperAdmin(): bool
    {
        return str_contains(strtolower((string) $this->emp_categ), 'super');
    }

    public function isAdmin(): bool
    {
        $categ = strtolower((string) $this->emp_categ);

        return str_contains($categ, 'admin');
    }

    public function isActive(): bool
    {
        return $this->emp_deleted === null && $this->emp_suspended === null;
    }
}
