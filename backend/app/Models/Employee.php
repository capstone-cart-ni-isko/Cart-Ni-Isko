<?php
namespace App\Models;
use App\Support\EmployeePassword;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Schema;

class Employee extends Authenticatable
{
    protected $table = 'employee';
    protected $primaryKey = 'emp_id';
    public $timestamps = false;

    protected static function booted(): void
    {
        static::saving(function (Employee $employee) {
            $plain = (string) $employee->emp_password;

            if ($plain !== '' && ! EmployeePassword::isHashed($plain)) {
                $employee->emp_password = EmployeePassword::make($plain);
            }
        });
    }

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

    public function category(): string
    {
        return strtolower((string) ($this->emp_categ ?: $this->emp_type));
    }

    private static ?bool $hasPresentColumn = null;

    public static function availabilityColumn(): string
    {
        if (self::$hasPresentColumn === null) {
            try {
                self::$hasPresentColumn = Schema::hasColumn('employee', 'emp_present');
            } catch (\Throwable $e) {
                return 'emp_instore';
            }
        }

        return self::$hasPresentColumn ? 'emp_present' : 'emp_instore';
    }

    public function inStore(): bool
    {
        return (bool) $this->getAttribute(self::availabilityColumn());
    }

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

    /**
     * Avatars on our own storage are saved as their "/storage/..." path and
     * served with the host answering the request, so an upload made through
     * a local API (http://127.0.0.1:8000) still shows on the deployed site.
     */
    public function getEmpAvatarAttribute($value)
    {
        return filled($value) ? \App\Http\Controllers\ProductsAPI::publicPicture($value) : $value;
    }

    public function setEmpAvatarAttribute($value)
    {
        if (is_string($value) && preg_match('#^https?://[^/]+(/storage/.+)$#i', trim($value), $m)) {
            $value = $m[1];
        }

        $this->attributes['emp_avatar'] = $value;
    }

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
