<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

/** DOMAIN 32 / FLOW-ACCESS_LOG-01: immutable customer access log rows. */
class CustLog extends Model
{
    protected $table = 'custlog';
    protected $primaryKey = 'custlog_id';
    public $timestamps = false;

    protected $fillable = [
        'cust_id',
        'custlog_access',
        'custlog_endpoint',
        'custlog_created',
    ];

    protected $casts = ['custlog_created' => 'datetime'];
}
