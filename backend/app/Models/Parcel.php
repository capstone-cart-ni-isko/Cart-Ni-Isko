<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class Parcel extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'parcel';
        protected $primaryKey = 'parcel_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'ord_id',
            'deliver_id',
            'pay_id',
            'parcel_created',
            'parcel_completed',
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
