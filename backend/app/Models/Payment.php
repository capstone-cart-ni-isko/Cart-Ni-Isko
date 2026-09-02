<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class Payment extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'payment';
        protected $primaryKey = 'pay_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'pay_created',
            'pay_ref',
            'pay_given',
            'pay_due',
            'pay_change',
        ];
    }
