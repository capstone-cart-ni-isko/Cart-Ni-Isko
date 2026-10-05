<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/** Rule 53: a preorder is claimed either by pickup or by delivery. */
class Delivery extends Model
{
    protected $table = 'delivery';
    protected $primaryKey = 'deliver_id';
    public $timestamps = false;

    // Live schema columns (verified against Supabase):
    // deliver_id, deliver_created, deliver_deleted, delivery_ref,
    // deliver_date, deliver_address, deliver_status, deliver_qr
    protected $fillable = [
        'deliver_created',
        'deliver_deleted',
        'delivery_ref',
        'deliver_date',
        'deliver_address',
        'deliver_status',
        'deliver_qr',
    ];

    protected $casts = [
        'deliver_created' => 'datetime',
        'deliver_deleted' => 'datetime',
        'deliver_date'    => 'datetime',
    ];

    /**
     * Delivery rows link to orders through the parcel table.
     * For convenience, expose a direct ord_id scope via parcel.
     */
    public function parcel()
    {
        return $this->hasOne(Parcel::class, 'deliver_id', 'deliver_id');
    }
}
