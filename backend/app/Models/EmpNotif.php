<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmpNotif extends Model
{
    protected $table = 'empnotif';
    protected $primaryKey = 'empnotif_id';
    public $timestamps = false;

    protected $fillable = [
        // `empnotif_id` has no sequence on the live table, so writers pass
        // the number from App\Support\IdAllocator::next().
        'empnotif_id',
        'emp_id',
        'empnotif_created',
        'empnotif_read',
        'empnotif_msg',
        'empnotif_type',
    ];

    protected $casts = [
        'empnotif_created' => 'datetime',
        'empnotif_read' => 'datetime',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
    }
}
