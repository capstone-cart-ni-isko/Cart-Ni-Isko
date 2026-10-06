<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/** Rule 53: a preorder is claimed either by pickup or by delivery. */
class Delivery extends Model
{
    protected $table = 'delivery';
    protected $primaryKey = 'deliver_id';
    public $timestamps = false;

    // Live schema columns (verified against Supabase information_schema):
    // deliver_id, ord_id, cust_id, deliver_address, deliver_phone, deliver_qr,
    // deliver_expect, deliver_created, deliver_end, deliver_env, deliver_recipient,
    // deliver_lat, deliver_lng, deliver_notes, deliver_service, deliver_fee_charged,
    // deliver_fee_actual, deliver_placed, deliver_pickedup, deliver_completed,
    // deliver_share_link, deliver_last_event.
    // Legacy spellings stay fillable so older writers keep working on the sqlite
    // test schema; `deliver_timestamp` (Domain 27/28 wording) is an alias below.
    // `deliver_id` itself has no sequence on the live table, so writers pass the
    // number from App\Support\IdAllocator::next().
    protected $fillable = [
        'deliver_id',
        'ord_id',
        'cust_id',
        'deliver_created',
        'deliver_deleted',
        'delivery_ref',
        'deliver_date',
        'deliver_address',
        'deliver_phone',
        'deliver_status',
        'deliver_qr',
        'deliver_expect',
        'deliver_end',
        'deliver_timestamp',
        'deliver_pickedup',
        'deliver_completed',
    ];

    protected $casts = [
        'deliver_created'    => 'datetime',
        'deliver_deleted'    => 'datetime',
        'deliver_date'       => 'datetime',
        'deliver_expect'     => 'datetime',
        'deliver_end'        => 'datetime',
        'deliver_pickedup'   => 'datetime',
        'deliver_completed'  => 'datetime',
    ];

    /**
     * FLOW-ORD_CLAIM-08 / FLOW-ORD_LIST-09: the claim (end-of-delivery) stamp.
     *
     * The Domain 27/28 spec calls this column `deliver_timestamp`, but the live
     * `delivery` table carries `deliver_end` (the system doc's own name) and DDL
     * is off limits, so the attribute is exposed as a write-through alias:
     * assigning `deliver_timestamp` stores `deliver_end`, and reading it returns
     * `deliver_end`. Either spelling is safe to mass-assign.
     */
    public function getDeliverTimestampAttribute()
    {
        return $this->getAttribute('deliver_end');
    }

    public function setDeliverTimestampAttribute($value): void
    {
        $this->setAttribute('deliver_end', $value);
    }

    /**
     * Legacy linkage: a delivery row may still be tied to its order through
     * `parcel.ord_id` (delivery.ord_id is stamped from checkout on new rows).
     */
    public function parcel()
    {
        return $this->hasOne(Parcel::class, 'deliver_id', 'deliver_id');
    }

    /** The order this delivery belongs to, when delivery.ord_id is populated. */
    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }
}
