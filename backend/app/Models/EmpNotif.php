<?php

    namespace App\Models;

    use Illuminate\Database\Eloquent\Model;

    class EmpNotif extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'empnotif';
        protected $primaryKey = 'empnotif_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'emp_id',
            'empnotif_created',
            'empnotif_read',
            'empnotif_msg',
        ];

        public function employee()
        {
            return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
        }
    }
