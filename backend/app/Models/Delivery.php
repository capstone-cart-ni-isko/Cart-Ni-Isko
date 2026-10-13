<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Delivery extends Model
{
    protected $table = 'delivery';
    protected $primaryKey = 'deliver_id';
    public $timestamps = false;

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

    public function getDeliverTimestampAttribute()
    {
        return $this->getAttribute('deliver_end');
    }

    public function setDeliverTimestampAttribute($value): void
    {
        $this->setAttribute('deliver_end', $value);
    }

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

    public function shareUrl(): ?string
    {
        return $this->courier()['url'];
    }

    public function courierOrderId(): ?string
    {
        return $this->courier()['id'];
    }

    public function isBooked(): bool
    {
        return $this->deliver_placed !== null;
    }

    public function storeCourier(array $courier): void
    {
        $current = $this->courier();
        $merged  = array_merge($current, array_filter($courier, fn ($v) => $v !== null));

        $this->forceFill([
            'deliver_share_link' => json_encode($merged, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ])->save();
    }

    public function parcel()
    {
        return $this->hasOne(Parcel::class, 'deliver_id', 'deliver_id');
    }

    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }
}
