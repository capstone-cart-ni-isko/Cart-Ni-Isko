<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    protected $table = 'items';
    protected $primaryKey = 'item_id';
    public $timestamps = false;
    public $incrementing = true;

    // Live schema columns: item_id, ord_id, prod_id, item_qty, item_amount
    protected $fillable = [
        'ord_id',
        'prod_id',
        'item_qty',
        'item_amount',
    ];

    protected $casts = [
        'item_qty'    => 'integer',
        'item_amount' => 'float',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }
}
