<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/**
 * Rules 13-15 (BAG): one row per customer + product variation, with the
 * number of pieces. `bag_placed` flips to true once the row has been cut
 * into an order; `bag_deleted` is the soft delete REQ-BAG-02 asks for.
 */
class Bag extends Model
{
    protected $table = 'bag';
    protected $primaryKey = 'bag_id';
    public $timestamps = false;

    protected $fillable = [
        // `bag_id` has no sequence on the live table, so writers pass the
        // number from App\Support\IdAllocator::next().
        'bag_id',
        'cust_id',
        'prodvar_id',
        'bag_qty',
        'bag_amount',
        'bag_placed',
        'bag_created',
        'bag_deleted',
    ];

    protected $casts = [
        'bag_qty' => 'integer',
        'bag_amount' => 'float',
        'bag_placed' => 'boolean',
        'bag_created' => 'datetime',
        'bag_deleted' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function prodvar()
    {
        return $this->belongsTo(Prodvar::class, 'prodvar_id', 'prodvar_id');
    }

    /** Still on the shelf, not yet checked out and not removed. */
    public function scopeLive($query)
    {
        return $query->whereNull('bag_deleted')->where('bag_placed', false);
    }
}
