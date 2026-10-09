<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'orders';
    protected $primaryKey = 'ord_id';
    public $timestamps = false;

    // Live schema columns (verified against Supabase): ord_id, cust_id,
    // ord_amount, ord_status, ord_claiming, pay_received, pay_change,
    // pay_reference, ord_created. Legacy keys (ord_tag/ord_completed/
    // ord_rating/ord_review) stay fillable for writers/tests that still send
    // them; they are simply absent from the live table.
    // `ord_discount` is the register's discount (Apply Discount at the POS) -
    // nullable, so orders written before it carry no discount.
    // `ord_id` is fillable because the live table has no sequence for it:
    // writers must pass the number from App\Support\IdAllocator::next().
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

    /**
     * The legacy order -> delivery link (UserAPI/OrdersAPI/OrdersAPI and
     * ReportBuilder all eager-load `parcel.delivery` / `parcel.payment`).
     * The relation used to be missing entirely, which made every one of those
     * queries die with RelationNotFoundException; the `parcel` table does exist
     * live (parcel_id, ord_id, deliver_id, pay_id, ...), so point at it.
     */
    public function parcel()
    {
        return $this->hasOne(Parcel::class, 'ord_id', 'ord_id');
    }

    public function payment()
    {
        // Payment is linked through parcel.pay_id (live `pickup` has no pay_id
        // column any more); payment columns also live on the order itself.
        return $this->hasOneThrough(Payment::class, Parcel::class, 'ord_id', 'pay_id', 'ord_id', 'pay_id');
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
