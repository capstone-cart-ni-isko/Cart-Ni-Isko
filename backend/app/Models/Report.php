<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Report extends Model
{
    // Define the table name, primary key, and timestamps
    protected $table = 'reports';
    protected $primaryKey = 'report_id';
    public $timestamps = false;

    // Define the fillable attributes for mass assignment
    protected $fillable = [
        'emp_id',
        'report_created',
        'report_file',
        'report_title',
        'report_text',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'emp_id', 'emp_id');
    }
}