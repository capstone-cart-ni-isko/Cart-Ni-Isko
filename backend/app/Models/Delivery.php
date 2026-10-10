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
        // LalaMove integration (system-new.docx "LALAMOVE INTEGRATION
        // SUGGESTIONS"). All of these already exist on the live table - no DDL
        // was needed - but they were not mass-assignable, so `Delivery::create`
        // / `->update()` silently dropped every courier attribute.
        'deliver_env',
        'deliver_recipient',
        'deliver_lat',
        'deliver_lng',
        'deliver_notes',
        'deliver_service',
        'deliver_fee_charged',
        'deliver_fee_actual',
        'deliver_placed',
        'deliver_share_link',
        'deliver_last_event',
    ];

    protected $casts = [
        'deliver_created'    => 'datetime',
        'deliver_deleted'    => 'datetime',
        'deliver_date'       => 'datetime',
        'deliver_expect'     => 'datetime',
        'deliver_end'        => 'datetime',
        'deliver_placed'     => 'datetime',
        'deliver_pickedup'   => 'datetime',
        'deliver_completed'  => 'datetime',
        'deliver_last_event' => 'datetime',
        'deliver_fee_charged'=> 'float',
        'deliver_fee_actual' => 'float',
        'deliver_lat'        => 'float',
        'deliver_lng'        => 'float',
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
     * The LalaMove booking this delivery is tied to.
     *
     * There is no courier column on the live schema and DDL is off limits, so
     * the booking is kept INSIDE `deliver_share_link` as a small JSON envelope
     * that also carries the tracking URL the customer is shown:
     *
     *   {"id":"107900701184","url":"https://share.lalamove.com/...","status":"PICKED_UP"}
     *
     * A plain URL written by an older row still decodes, so the field stays
     * backwards compatible.
     *
     * @return array{id: ?string, url: ?string, status: ?string}
     */
    public function courier(): array
    {
        $raw = trim((string) $this->deliver_share_link);

        if ($raw === '') {
            return ['id' => null, 'url' => null, 'status' => null];
        }

        if (str_starts_with($raw, '{')) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return [
                    'id'     => isset($decoded['id']) && $decoded['id'] !== '' ? (string) $decoded['id'] : null,
                    'url'    => isset($decoded['url']) && $decoded['url'] !== '' ? (string) $decoded['url'] : null,
                    'status' => isset($decoded['status']) && $decoded['status'] !== ''
                        ? (string) $decoded['status'] : null,
                ];
            }
        }

        if (preg_match('~^https?://~i', $raw)) {
            return ['id' => null, 'url' => $raw, 'status' => null];
        }

        return ['id' => $raw, 'url' => null, 'status' => null];
    }

    /** The tracking URL shown to the customer and the staff. */
    public function shareUrl(): ?string
    {
        return $this->courier()['url'];
    }

    /** The LalaMove order number, used to read status and to cancel. */
    public function courierOrderId(): ?string
    {
        return $this->courier()['id'];
    }

    /** True once PayMongo has been confirmed and the courier was booked. */
    public function isBooked(): bool
    {
        return $this->deliver_placed !== null;
    }

    /**
     * Write the courier booking back into the one column that can hold it.
     *
     * @param array{id?: ?string, url?: ?string, status?: ?string} $courier
     */
    public function storeCourier(array $courier): void
    {
        $current = $this->courier();
        $merged  = array_merge($current, array_filter($courier, fn ($v) => $v !== null));

        $this->forceFill([
            'deliver_share_link' => json_encode($merged, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ])->save();
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
