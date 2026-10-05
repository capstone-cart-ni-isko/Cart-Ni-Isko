<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/**
 * The payment table records every completed payment.
 * Live schema: pay_id, pay_created, pay_ref, pay_given, pay_due, pay_change
 */
class Payment extends Model
{
    protected $table = 'payment';
    protected $primaryKey = 'pay_id';
    public $timestamps = false;

    protected $fillable = [
        'pay_created',
        'pay_ref',
        'pay_given',
        'pay_due',
        'pay_change',
    ];

    protected $casts = [
        'pay_created' => 'datetime',
        'pay_given'   => 'float',
        'pay_due'     => 'float',
        'pay_change'  => 'float',
    ];
}
