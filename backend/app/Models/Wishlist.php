<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * DOMAIN 24 (WISHLIST). REQ-WISHLIST-02 wants a soft delete, so removal sets
 * `wish_hidden` instead of dropping the row.
 */
class Wishlist extends Model
{
    protected $table = 'wishlist';
    protected $primaryKey = 'wish_id';
    public $timestamps = false;

    protected $fillable = [
        'cust_id',
        'prod_id',
        'wish_created',
        'wish_hidden',
    ];

    protected $casts = [
        'wish_created' => 'datetime',
        'wish_hidden' => 'datetime',
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
