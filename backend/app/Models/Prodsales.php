<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/**
 * DOMAIN 9 / DOMAIN 14 metric source: one rolled-up row per product
 * variation per day. Aggregates are maintained by OrdersAPI/PosAPI whenever
 * an order is placed, cancelled or claimed.
 */
class Prodsales extends Model
{
    protected $table = 'prodsales';
    protected $primaryKey = 'prodsales_id';
    public $timestamps = false;

    protected $fillable = [
        'prodvar_id',
        'prodsales_date',
        'prodsales_qty',
        'prodsales_amount',
        'prodsales_bag',
        'prodsales_cust',
        'prodsales_guest',
        'prodsales_walkin',
        'prodsales_preorder',
        'prodsales_unsold',
        'prodsales_cancelled',
        'prodsales_wishlist',
        'prodsales_bueno_categ',
        'prodsales_college',
        'prodsales_created',
    ];

    protected $casts = [
        'prodsales_date' => 'date',
        'prodsales_created' => 'datetime',
        'prodsales_qty' => 'integer',
        'prodsales_amount' => 'float',
    ];

    public function prodvar()
    {
        return $this->belongsTo(Prodvar::class, 'prodvar_id', 'prodvar_id');
    }
}
