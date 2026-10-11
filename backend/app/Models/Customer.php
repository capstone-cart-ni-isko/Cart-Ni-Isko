<?php
    namespace App\Models;
    use Illuminate\Foundation\Auth\User as Authenticatable;
    use Laravel\Sanctum\HasApiTokens;

    class Customer extends Authenticatable
    {
        // Issue personal access tokens so auth:sanctum can resolve the account
        use HasApiTokens;

        // Define the table name, primary key, and timestamps
        protected $table = 'customer';
        protected $primaryKey = 'cust_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment.
        //
        // Two generations live side by side on purpose: the system-new.docx
        // SCHEMA (the live Supabase columns - cust_givname, cust_surname,
        // cust_bday, cust_categ, cust_dept, ...) is what the application
        // writes, while the legacy names stay listed because the pre-migration
        // test fixtures still create rows with them.
        protected $fillable = [
            // --- system-new.docx SCHEMA (live database) ---
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

            // --- legacy aliases (pre-migration fixtures / old payloads) ---
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

        // Define the hidden attributes that should not be visible in JSON responses
        protected $hidden = [
            'cust_password',
        ];

        protected $casts = [
            'cust_cred_changed' => 'datetime',
        ];

        /*
            system-new.docx MODELS aggregates the supporting tables onto their
            owner: everything keyed by `cust_id` hangs off this model (the
            tables themselves are read/written through DatabaseAPI, rule 80).
        */
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
