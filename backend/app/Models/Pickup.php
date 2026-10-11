<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/** Rule 54: a preorder pickup is both an appointment and an order. */
class Pickup extends Model
{
    protected $table = 'pickup';
    protected $primaryKey = 'pickup_id';
    public $timestamps = false;

    // Live schema columns: pickup_id, ord_id, appoint_id, pay_id,
    // pickup_created, pickup_completed
    // `pickup_id` is fillable because the live table has no sequence for it:
    // writers must pass the number from App\Support\IdAllocator::next().
    protected $fillable = [
        'pickup_id',
        'ord_id',
        'appoint_id',
        'pay_id',
        'pickup_created',
        'pickup_completed',
    ];

    protected $casts = [
        'pickup_created'   => 'datetime',
        'pickup_completed' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }

    public function appointment()
    {
        return $this->belongsTo(Visit::class, 'appoint_id', 'appoint_id');
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class, 'pay_id', 'pay_id');
    }
}
