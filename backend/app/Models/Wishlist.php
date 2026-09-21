<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Wishlist extends Model
{
    protected $table = 'wishlist';
    public $timestamps = false;
    public $incrementing = false;

    protected $fillable = [
        'cust_id',
        'prod_id',
        'item_qty',
        'item_amount',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }
}
