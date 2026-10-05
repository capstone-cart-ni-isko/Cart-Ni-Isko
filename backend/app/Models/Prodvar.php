<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Prodvar extends Model
{
    protected $table = 'prodvar';
    protected $primaryKey = 'prodvar_id';
    public $timestamps = false;

    protected $fillable = [
        'prod_id',
        'prodvar_name',
        'prodvar_pic',
        'prodvar_stock',
        'prodvar_main',
        'prodvar_markup',
        'prodvar_options',
        'prodvar_preorder',
        'prodvar_created',
        'prodvar_disabled',
        'prodvar_deleted',
    ];

    protected $casts = [
        'prodvar_stock' => 'integer',
        'prodvar_main' => 'boolean',
        'prodvar_markup' => 'float',
        'prodvar_preorder' => 'boolean',
        'prodvar_created' => 'datetime',
        'prodvar_disabled' => 'datetime',
        'prodvar_deleted' => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class, 'prod_id', 'prod_id');
    }

    /** What the customer actually pays for one piece of this variation. */
    public function unitPrice(): float
    {
        $base = (float) ($this->product->prod_price ?? 0);

        return round($base + (float) ($this->prodvar_markup ?? 0), 2);
    }
}
