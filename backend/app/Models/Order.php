<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class Order extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'orders';
        protected $primaryKey = 'ord_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'cust_id',
            'ord_created',
            'ord_completed',
            'ord_tag',
            'ord_status',
            'ord_rating',
            'ord_review',
        ];

        public function items()
        {
            return $this->hasMany(Item::class, 'ord_id', 'ord_id');
        }

        public function customer()
        {
            return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
        }
    }
