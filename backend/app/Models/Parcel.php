<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/**
 * Links an order to a delivery row.
 * Live schema: parcel_id, ord_id, deliver_id, pay_id, parcel_created, parcel_completed
 */
class Parcel extends Model
{
    protected $table = 'parcel';
    protected $primaryKey = 'parcel_id';
    public $timestamps = false;

    protected $fillable = [
        'ord_id',
        'deliver_id',
        'pay_id',
        'parcel_created',
        'parcel_completed',
    ];

    protected $casts = [
        'parcel_created'   => 'datetime',
        'parcel_completed' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }

    public function delivery()
    {
        return $this->belongsTo(Delivery::class, 'deliver_id', 'deliver_id');
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class, 'pay_id', 'pay_id');
    }
}
