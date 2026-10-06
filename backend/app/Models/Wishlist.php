<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * DOMAIN 24 (WISHLIST). REQ-WISHLIST-02 asks for a soft delete, so removal
 * stamps `wish_hidden` instead of dropping the row; display queries only
 * rows WHERE wish_hidden IS NULL (the live soft-delete column) ordered by
 * wish_created DESC (FLOW-WISHLIST-03).
 */
class Wishlist extends Model
{
    protected $table = 'wishlist';
    protected $primaryKey = 'wish_id';
    public $timestamps = false;

    // Live schema columns: wish_id, cust_id, prod_id, wish_created, wish_hidden
    // `wish_id` has no sequence on the live table, so writers pass the number
    // from App\Support\IdAllocator::next().
    protected $fillable = [
        'wish_id',
        'cust_id',
        'prod_id',
        'wish_created',
        'wish_hidden',
    ];

    protected $casts = [
        'wish_created' => 'datetime',
        'wish_hidden'  => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }

    /** FLOW-WISHLIST-03: visible = not soft-hidden yet. */
    public function scopeVisible($query)
    {
        return $query->whereNull('wish_hidden');
    }
}
