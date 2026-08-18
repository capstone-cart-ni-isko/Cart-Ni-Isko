<?php
    namespace App\Models;
    use Illuminate\Database\Eloquent\Model;

    class Customer extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'customer';
        protected $primaryKey = 'cust_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'cust_created',
            'cust_disabled',
            'cust_deleted',
            'cust_password',
            'cust_nickname',
            'cust_pronoun',
            'cust_birthday',
            'cust_brgy',
            'cust_city',
            'cust_province',
            'cust_callcode',
            'cust_phone',
            'cust_email',
            'cust_backupcallcode',
            'cust_backupphone',
            'cust_backupemail',
            'cust_type',
            'cust_college',
            'cust_wishlist',
            'cust_cart',
            'cust_orders',
            'cust_appoints',
        ];

        // Define the hidden attributes that should not be visible in JSON responses
        protected $hidden = [
            'cust_password',
        ];
    }