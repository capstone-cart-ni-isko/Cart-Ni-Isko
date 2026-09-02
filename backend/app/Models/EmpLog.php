<?php
    namespace App\Models;
    use Illuminate\Database\Eloquent\Model;

    class EmpLog extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'emplog';
        protected $primaryKey = 'emplog_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'emp_id',
            'emplog_created',
            'emplog_action',
            'emplog_desc',
        ];
    }
