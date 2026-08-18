<?php
    namespace App\Models;
    use Illuminate\Database\Eloquent\Model;

    class Employee extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'employee';
        protected $primaryKey = 'emp_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'emp_created',
            'emp_disabled',
            'emp_deleted',
            'emp_password',
            'emp_surname',
            'emp_givname',
            'emp_midname',
            'emp_suffix',
            'emp_studnum',
            'emp_pronoun',
            'emp_birthday',
            'emp_brgy',
            'emp_city',
            'emp_province',
            'emp_country',
            'emp_callcode',
            'emp_phone',
            'emp_email',
            'emp_backupcallcode',
            'emp_backupphone',
            'emp_backupemail',
            'emp_type',
            'emp_instore',
        ];

        // Define the hidden attributes that should not be visible in JSON responses
        protected $hidden = [
            'emp_password',
        ];
    }