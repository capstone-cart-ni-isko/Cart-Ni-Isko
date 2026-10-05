<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/** DOMAIN 32 / FLOW-ACCESS_LOG-04: immutable employee access log rows. */
class EmpLog extends Model
{
    protected $table = 'emplog';
    protected $primaryKey = 'emplog_id';
    public $timestamps = false;

    protected $fillable = [
        'emp_id',
        'emplog_access',
        'emplog_endpoint',
        'emplog_created',
    ];

    protected $casts = ['emplog_created' => 'datetime'];
}
