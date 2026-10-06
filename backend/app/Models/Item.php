<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    protected $table = 'items';
    protected $primaryKey = 'item_id';
    public $timestamps = false;
    public $incrementing = true;

    // Live schema columns: item_id, ord_id, bag_id, item_created
    // (quantity/amount live on the linked bag row; the item_qty/item_amount/
    // prod_id spellings are kept fillable for the legacy sqlite test schema).
    // `item_id` is fillable because the live table has no sequence for it:
    // writers must pass the number from App\Support\IdAllocator::next().
    protected $fillable = [
        'item_id',
        'ord_id',
        'bag_id',
        'prod_id',
        'item_qty',
        'item_amount',
        'item_created',
    ];

    protected $casts = [
        'bag_id'       => 'integer',
        'item_qty'     => 'integer',
        'item_amount'  => 'float',
        'item_created' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'ord_id', 'ord_id');
    }

    /**
     * FLOW-CHECKOUT-02 / REQ-BAG-01: an order line is cut from one bag row.
     * TrackingAPI's fulfil/restock/bump paths walk items -> bag -> prodvar, so
     * without this relation every scan hit `RelationNotFoundException` (500).
     */
    public function bag()
    {
        return $this->belongsTo(Bag::class, 'bag_id', 'bag_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }
}
