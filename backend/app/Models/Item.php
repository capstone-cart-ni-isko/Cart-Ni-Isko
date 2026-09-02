<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class Item extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'items';
        public $timestamps = false;
        public $incrementing = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'ord_id',
            'prod_id',
            'item_qty',
            'item_amount',
        ];

        public function product()
        {
            return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
        }

        public function order()
        {
            return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
        }
    }
