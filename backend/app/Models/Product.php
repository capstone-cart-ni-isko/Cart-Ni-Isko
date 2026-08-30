<?php
    namespace App\Models;
    use Illuminate\Database\Eloquent\Model;

    class Product extends Model
    {
        // Define the table name, primary key, and timestamps
        protected $table = 'product';
        protected $primaryKey = 'prod_id';
        public $timestamps = false;

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'prod_created',
            'prod_disabled',
            'prod_deleted',
            'prod_tag',
            'prod_name',
            'prod_categ',
            'prod_price',
            'prod_qty',
            'prod_desc',
            'prod_peakqty',
            'prod_peaksold',
            'prod_peakdate',
            'prod_todayqty',
            'prod_todaysold',
        ];
    }
