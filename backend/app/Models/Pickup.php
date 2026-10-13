<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Pickup extends Model
{
    protected $table = 'pickup';
    protected $primaryKey = 'pickup_id';
    public $timestamps = false;

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
