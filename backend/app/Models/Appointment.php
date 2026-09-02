<?php
    namespace App\Models;
    use Illuminate\Database\Eloquent\Model;

    class Appointment extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'appointment';
        protected $primaryKey = 'appoint_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'cust_id',
            'appoint_created',
            'appoint_closed',
            'appoint_date',
            'appoint_type',
            'appoint_qr',
            'appoint_desc',
        ];
    }
