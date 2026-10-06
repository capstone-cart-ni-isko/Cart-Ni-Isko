<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustNotif extends Model
{
    protected $table = 'custnotif';
    protected $primaryKey = 'custnotif_id';
    public $timestamps = false;

    protected $fillable = [
        // `custnotif_id` has no sequence on the live table, so writers pass
        // the number from App\Support\IdAllocator::next().
        'custnotif_id',
        'cust_id',
        'custnotif_created',
        'custnotif_read',
        'custnotif_msg',
        'custnotif_type',
    ];

    protected $casts = [
        'custnotif_created' => 'datetime',
        'custnotif_read' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }
}
