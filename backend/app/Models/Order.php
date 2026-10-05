<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'orders';
    protected $primaryKey = 'ord_id';
    public $timestamps = false;

    // Live schema columns only (verified against Supabase):
    // ord_id, cust_id, ord_created, ord_completed, ord_tag,
    // ord_status, ord_rating, ord_review
    protected $fillable = [
        'cust_id',
        'ord_created',
        'ord_completed',
        'ord_tag',
        'ord_status',
        'ord_rating',
        'ord_review',
    ];

    protected $casts = [
        'ord_created'   => 'datetime',
        'ord_completed' => 'datetime',
        'ord_rating'    => 'float',
    ];

    public function items()
    {
        return $this->hasMany(Item::class, 'ord_id', 'ord_id');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function pickup()
    {
        return $this->hasOne(Pickup::class, 'ord_id', 'ord_id');
    }

    public function delivery()
    {
        return $this->hasOne(Delivery::class, 'ord_id', 'ord_id');
    }

    public function payment()
    {
        // Payment is linked through pickup.pay_id or parcel.pay_id;
        // for convenience, load via pickup first.
        return $this->hasOneThrough(Payment::class, Pickup::class, 'ord_id', 'pay_id', 'ord_id', 'pay_id');
    }

    /**
     * Rule 52 / FLOW-MANAGE_PRE-01: an order with a pickup or delivery row is
     * a preorder, an order with neither was rung up at the counter (POS).
     */
    public function isWalkIn(): bool
    {
        return ! Pickup::where('ord_id', $this->ord_id)->exists()
            && ! Delivery::where('ord_id', $this->ord_id)->exists();
    }

    /** True when this order is a cart-stage (CART-* tag) entry. */
    public function isCartEntry(): bool
    {
        return str_starts_with((string) $this->ord_tag, 'CART-');
    }
}
