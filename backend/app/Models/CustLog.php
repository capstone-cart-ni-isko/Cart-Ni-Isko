<?php
    namespace App\Models;
    use Illuminate\Database\Eloquent\Model;

    class CustLog extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'custlog';
        protected $primaryKey = 'custlog_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'cust_id',
            'custlog_created',
            'custlog_action',
            'custlog_desc',
        ];
    }
