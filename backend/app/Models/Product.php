<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $table = 'product';
    protected $primaryKey = 'prod_id';
    public $timestamps = false;

    protected $fillable = [
        'prod_name',
        'prod_categ',
        'prod_desc',
        'prod_tag',
        'prod_price',
        'prod_qty',
        'prod_rating',
        'prod_reviews',
        'prod_review_count',
        'prod_rating_breakdown',
        'prod_sizes',
        'prod_colors',
        'prod_images',
        'prod_preorder',
        'prod_preorder_info',
        'prod_status',
        'prod_stock_matrix',
        'prod_details',
        'prod_created',
        'prod_disabled',
        'prod_deleted',
    ];

    protected $casts = [
        'prod_price'            => 'float',
        'prod_qty'              => 'integer',
        'prod_rating'           => 'float',
        'prod_review_count'     => 'integer',
        'prod_preorder'         => 'boolean',
        'prod_created'          => 'datetime',
        'prod_disabled'         => 'datetime',
        'prod_deleted'          => 'datetime',
    ];

    public function reviews()
    {
        return $this->hasMany(Review::class, 'prod_id', 'prod_id');
    }

    /**
     * Live stock uses prod_qty column directly (no prodvar table exists).
     * The frontend normalizeVariations() reads JSON columns instead.
     */
    public function totalStock(): int
    {
        return (int) ($this->prod_qty ?? 0);
    }

    /** Rule 60 / REQ-CATALOG-03: disabled products never reach the catalog. */
    public function isBuyable(): bool
    {
        return $this->prod_disabled === null && $this->prod_deleted === null;
    }
}
