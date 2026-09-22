<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class CustNotif extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'custnotif';
        protected $primaryKey = 'custnotif_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'cust_id',
            'custnotif_created',
            'custnotif_read',
            'custnotif_msg',
        ];

        public function customer()
        {
            return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
        }
    }
