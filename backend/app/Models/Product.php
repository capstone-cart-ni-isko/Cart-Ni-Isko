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
            'prod_sizes',
            'prod_colors',
            'prod_images',
            'prod_preorder',
            'prod_status',
            'prod_preorder_info',
            'prod_stock_matrix',
            'prod_details',
            'prod_rating',
            'prod_review_count',
            'prod_rating_breakdown',
            'prod_reviews',
        ];

        protected $casts = [
            'prod_sizes' => 'array',
            'prod_colors' => 'array',
            'prod_images' => 'array',
            'prod_preorder_info' => 'array',
            'prod_stock_matrix' => 'array',
            'prod_details' => 'array',
            'prod_rating_breakdown' => 'array',
            'prod_reviews' => 'array',
        ];
    }
