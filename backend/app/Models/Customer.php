<?php
namespace App\Models;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'customer';
    protected $primaryKey = 'cust_id';
    public $timestamps = false;

    protected $fillable = [
        'cust_id',
        'cust_givname',
        'cust_surname',
        'cust_email',
        'cust_phone',
        'cust_password',
        'cust_callcode',
        'cust_pronoun',
        'cust_type',
        'cust_categ',
        'cust_college',
        'cust_dept',
        'cust_address',
        'cust_bday',
        'cust_avatar',
        'cust_backup_phone',
        'cust_backup_email',
        'cust_backup_ques',
        'cust_backup_answer',
        'cust_backup_code',
        'cust_created',
        'cust_deleted',
        'cust_suspended',
        'cust_darkmode',
        'cust_login_active',
        'cust_login_failed',
        'cust_last_logout',
        'cust_notif_appointremind',
        'cust_notif_email',
        'cust_notif_prod',
        'cust_appoint',
        'cust_orders',
        'cust_bag',
        'cust_wishlist',
        'cust_unread',
        'cust_disabled',
        'cust_nickname',
        'cust_birthday',
        'cust_brgy',
        'cust_city',
        'cust_province',
        'cust_country',
        'cust_username',
        'cust_campus',
        'cust_course',
        'cust_year',
        'cust_cred_changed',
        'cust_backupcallcode',
        'cust_backupphone',
        'cust_backupemail',
        'cust_cart',
        'cust_appoints',
        'cust_photo',
    ];

    protected $hidden = [
        'cust_password',
    ];

    protected $casts = [
        'cust_cred_changed' => 'datetime',
    ];

    /**
     * Avatars on our own storage are saved as their "/storage/..." path and
     * served with the host answering the request, so an upload made through
     * a local API (http://127.0.0.1:8000) still shows on the deployed site.
     */
    public function getCustAvatarAttribute($value)
    {
        return filled($value) ? \App\Http\Controllers\ProductsAPI::publicPicture($value) : $value;
    }

    public function setCustAvatarAttribute($value)
    {
        if (is_string($value) && preg_match('#^https?://[^/]+(/storage/.+)$#i', trim($value), $m)) {
            $value = $m[1];
        }

        $this->attributes['cust_avatar'] = $value;
    }

    public function bag()
    {
        return $this->hasMany(Bag::class, 'cust_id', 'cust_id');
    }

    public function orders()
    {
        return $this->hasMany(Order::class, 'cust_id', 'cust_id');
    }

    public function visits()
    {
        return $this->hasMany(Visit::class, 'cust_id', 'cust_id');
    }

    public function accessLog()
    {
        return $this->hasMany(CustLog::class, 'cust_id', 'cust_id');
    }

    public function notifications()
    {
        return $this->hasMany(CustNotif::class, 'cust_id', 'cust_id');
    }

    public function wishlist()
    {
        return $this->hasMany(Wishlist::class, 'cust_id', 'cust_id');
    }
}
