<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Appointment extends Model
{
    protected $table = 'appointments';
    protected $primaryKey = 'appoint_id';
    public $timestamps = false;

    protected $fillable = [
        'cust_id',
        'emp_id',
        'appoint_type',
        'appoint_status',
        'appoint_qr',
        'appoint_start',
        'appoint_end',
        'appoint_created',
        'appoint_closed',
    ];

    protected $casts = [
        'appoint_start' => 'datetime',
        'appoint_end' => 'datetime',
        'appoint_created' => 'datetime',
        'appoint_closed' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'cust_id', 'cust_id');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
    }

    /** FLOW-BOOK_APP-06 / REQ-BOOK_APP-01: every slot is exactly 10 minutes. */
    public function isOpen(): bool
    {
        return $this->appoint_status === 'upcoming' && $this->appoint_closed === null;
    }
}
