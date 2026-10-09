<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

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
        'prod_total_var',
        'prod_peaksold',
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
        'prod_total_var'        => 'integer',
        'prod_peaksold'         => 'float',
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
     * system-new.docx MODELS: product variants aggregate onto Product
     * (prodvar rows live in App\Support\DatabaseModels; only DatabaseAPI
     * touches them, rule 80).
     */
    public function variations()
    {
        return $this->hasMany(Prodvar::class, 'prod_id', 'prod_id');
    }

    /**
     * Live stock = SUM(prodvar.prodvar_stock) over the non-deleted variations.
     *
     * `product.prod_qty` is a legacy column that no writer touches (every
     * stock write goes to `prodvar`), so reading it returned 0 for every
     * product and the low-stock gate at ProductsAPI::updateProductDetails
     * fired on every edit. Falls back to the column only when the product has
     * no variation rows at all (pre-restore fixture data).
     */
    public function totalStock(): int
    {
        try {
            $sum = (int) Prodvar::where('prod_id', $this->prod_id)
                ->whereNull('prodvar_deleted')
                ->sum('prodvar_stock');

            if ($sum > 0 || Prodvar::where('prod_id', $this->prod_id)->whereNull('prodvar_deleted')->exists()) {
                return $sum;
            }
        } catch (\Throwable $e) {
            // No prodvar table on this connection: fall through to the column.
        }

        return (int) ($this->prod_qty ?? 0);
    }

    /** REQ-MANAGE_INV-06: total units ever sold, aggregated from prodsales. */
    public function totalSold(): int
    {
        try {
            return (int) DB::table('prodsales')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'prodsales.prodvar_id')
                ->where('prodvar.prod_id', $this->prod_id)
                ->sum('prodsales_qty');
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /** Rule 60 / REQ-CATALOG-03: disabled products never reach the catalog. */
    public function isBuyable(): bool
    {
        return $this->prod_disabled === null && $this->prod_deleted === null;
    }
}
