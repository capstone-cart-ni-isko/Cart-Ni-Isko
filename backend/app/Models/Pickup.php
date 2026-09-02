<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class Pickup extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'pickup';
        protected $primaryKey = 'pickup_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'ord_id',
            'appoint_id',
            'pay_id',
            'pickup_created',
            'pickup_completed',
        ];

        public function order()
        {
            return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
        }

        public function appointment()
        {
            return $this->belongsTo(Appointment::class, 'appoint_id', 'appoint_id');
        }

        public function payment()
        {
            return $this->belongsTo(Payment::class, 'pay_id', 'pay_id');
        }
    }
