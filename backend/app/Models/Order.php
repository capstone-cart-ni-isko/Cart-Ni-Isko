<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'orders';
    protected $primaryKey = 'ord_id';
    public $timestamps = false;

    protected $fillable = [
        'ord_id',
        'cust_id',
        'ord_created',
        'ord_completed',
        'ord_tag',
        'ord_status',
        'ord_rating',
        'ord_review',
        'ord_amount',
        'ord_discount',
        'ord_claiming',
        'pay_reference',
        'pay_received',
        'pay_change',
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

    public function parcel()
    {
        return $this->hasOne(Parcel::class, 'ord_id', 'ord_id');
    }

    public function payment()
    {
        return $this->hasOneThrough(Payment::class, Parcel::class, 'ord_id', 'pay_id', 'ord_id', 'pay_id');
    }

    public function isWalkIn(): bool
    {
        return ! Pickup::where('ord_id', $this->ord_id)->exists()
            && ! Delivery::where('ord_id', $this->ord_id)->exists();
    }

    public function isCartEntry(): bool
    {
        return str_starts_with((string) $this->ord_tag, 'CART-');
    }
}
