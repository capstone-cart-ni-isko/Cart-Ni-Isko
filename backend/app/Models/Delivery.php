<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class Delivery extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'delivery';
        protected $primaryKey = 'deliver_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'deliver_created',
            'deliver_deleted',
            'delvier_ref',
            'deliver_date',
            'deliver_address',
            'deliver_status',
            'deliver_qr',
        ];
    }
