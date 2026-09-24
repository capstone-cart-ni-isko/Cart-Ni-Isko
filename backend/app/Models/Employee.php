<?php
    namespace App\Models;
    use Illuminate\Foundation\Auth\User as Authenticatable;
    use Laravel\Sanctum\HasApiTokens;

    class Employee extends Authenticatable
    {
        // Issue personal access tokens so auth:sanctum can resolve the account
        use HasApiTokens;

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
            'emp_college',
            'emp_program',
            'emp_year',
            'emp_bloc',
            'emp_pronoun',
            'emp_birthday',
            'emp_brgy',
            'emp_city',
            'emp_province',
            'emp_country',
            'emp_callcode',
            'emp_phone',
            'emp_email',
            'emp_cred_changed',
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

        protected $casts = [
            'emp_created' => 'datetime',
            'emp_cred_changed' => 'datetime',
            'emp_year' => 'integer',
            'emp_instore' => 'boolean',
        ];
    }
