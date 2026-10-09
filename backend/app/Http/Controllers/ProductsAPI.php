<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\Prodvar;
use App\Models\Review;
use App\Support\SystemSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * ProductsAPI
 *
 * DOMAIN 9 / 10 / 13 / 23 - the customer catalog and the employee inventory: products, variants, reviews, uploads and enable/disable.
 *
 * Repackaged from: Products API, Reviews API, Upload API.
 */
class ProductsAPI extends Controller
{

    // ===== from the Products API file =====
/**
     * DOMAIN 9 / 10 / 23 (CATALOG & INVENTORY).
     *
     * Variations live in `prodvar`; the old JSON columns (prod_sizes,
     * prod_colors, prod_images, prod_stock_matrix, prod_qty, prod_peak*,
     * prod_today*, prod_reviews-as-array ...) no longer exist. Every response
     * therefore rebuilds that legacy shape from the prodvar rows so the
     * storefront keeps rendering, while the raw prodvar fields travel alongside
     * it. Aggregates come from product.prod_rating / prod_reviews /
     * prod_total_var and the prodsales table.
     */

    // ===== from the Products API file =====

        // ==========================================
        // PRESENTATION (legacy JSON aliases + raw prodvar rows)
        // ==========================================

        /**
         * One product as the API returns it: the new-schema columns plus the
         * legacy JSON shape rebuilt from its variations.
         *
         * @param \Illuminate\Support\Collection|array|null $variations already
         *        loaded prodvar rows (avoids an N+1 on list endpoints)
         * @param array|null $breakdown pre-computed approved rating breakdown
         * @param array|null $metrics pre-computed prodsales aggregates
         *        (['sold' => int]) so list endpoints stay at two queries
         */
        public static function present(Product $product, $variations = null, ?array $breakdown = null, ?array $metrics = null): array
        {
            $vars = $variations === null
                ? Prodvar::where('prod_id', $product->prod_id)
                    ->whereNull('prodvar_deleted')
                    ->orderBy('prodvar_id')
                    ->get()
                : collect($variations);

            $stock = (int) $vars->sum('prodvar_stock');
            $images = $vars->pluck('prodvar_pic')
                ->filter(fn ($pic) => filled($pic))
                ->unique()
                ->values();
            // Rule 19: the main image is the prodvar with prodvar_main=true,
            // otherwise the first non-null prodvar_pic.
            $main = $vars->first(fn (Prodvar $v) => (bool) $v->prodvar_main);
            $mainImage = ($main !== null && filled($main->prodvar_pic)) ? $main->prodvar_pic : $images->first();

            $payload = $product->attributesToArray();

            // Raw prodvar rows, exposed twice under two names so both the old
            // ("prodvar") and newer ("variations") readers keep working.
            $variationsPayload = $vars->map(function (Prodvar $variation) use ($product) {
                $row = $variation->attributesToArray();
                $row['unit_price'] = round((float) $product->prod_price + (float) ($variation->prodvar_markup ?? 0), 2);
                $row['available'] = $variation->prodvar_disabled === null;

                return $row;
            })->values()->all();

            $payload['variations'] = $variationsPayload;
            $payload['prodvar'] = $variationsPayload;

            // Legacy JSON shape, derived from the variation rows.
            $payload['prod_qty'] = $stock;
            $payload['prod_status'] = $stock > 0 ? 'In Stock' : 'Out of Stock';
            $payload['prod_images'] = $images->all() ?: null;
            $payload['prod_sizes'] = $vars->pluck('prodvar_name')->filter()->unique()->values()->all() ?: null;
            $payload['prod_colors'] = $images->isEmpty() ? null : $vars
                ->filter(fn (Prodvar $v) => filled($v->prodvar_pic))
                ->map(fn (Prodvar $v) => [
                    'name'    => $v->prodvar_name,
                    'value'   => '#FF6A00',
                    'image'   => $v->prodvar_pic,
                    'gallery' => [$v->prodvar_pic],
                ])
                ->values()
                ->all();
            $payload['prod_stock_matrix'] = $vars->mapWithKeys(
                fn (Prodvar $v) => [$v->prodvar_name => (int) $v->prodvar_stock]
            )->all();
            $payload['prod_preorder'] = (bool) $vars->contains(fn (Prodvar $v) => (bool) $v->prodvar_preorder);
            $payload['main_image'] = $mainImage;

            // Aggregates: prod_reviews is an int count now (the review rows
            // live in `reviews`), prod_review_count keeps the legacy name.
            $payload['prod_reviews'] = (int) $product->prod_reviews;
            $payload['prod_review_count'] = (int) $product->prod_reviews;
            $payload['prod_rating'] = round((float) $product->prod_rating, 2);
            $payload['prod_total_var'] = (int) $product->prod_total_var > 0
                ? (int) $product->prod_total_var
                : $vars->count();

            // REQ-MANAGE_INV-06: metrics come from `prodsales`, never from the
            // legacy `prod_peaksold` column (a stored 0 that no writer touches).
            // presentMany() passes the batched sum in via $metrics.
            $sold = $metrics['sold'] ?? $product->totalSold();
            $payload['stock']    = $stock;
            $payload['prod_peaksold'] = $sold;
            $payload['prod_sold']     = $sold;

            // FLOW-MANAGE_INV-06 / REQ-MANAGE_INV-04: the automated
            // low-stock alert as a per-row flag the admin list reads.
            $threshold = (int) (\App\Support\SystemSettings::get('low_stock_threshold', 5));
            $payload['low_stock'] = $stock <= $threshold;
            $payload['low_stock_threshold'] = $threshold;

            // The breakdown is computed from approved reviews only, so a stale
            // column can never show a moderation-untouched number.
            if ($breakdown === null) {
                $breakdown = self::ratingBreakdowns([(int) $product->prod_id])[(int) $product->prod_id] ?? null;
            }
            if ($breakdown !== null) {
                $payload['prod_rating_breakdown'] = $breakdown['breakdown'];
            }

            // REQ-MANAGE_INV-02: a disabled/deleted product - or one whose
            // variations are all disabled - is flagged for the wishlist and
            // every other surface that still shows the row.
            $visible = $vars->filter(fn (Prodvar $v) => $v->prodvar_disabled === null);
            $payload['available'] = $product->isBuyable() && $visible->isNotEmpty();
            $payload['unavailable'] = ! $payload['available'];

            return $payload;
        }

        /** Present a whole collection with two batched queries (vars + reviews). */
        public static function presentMany($products): array
        {
            $products = collect($products)->values();
            if ($products->isEmpty()) {
                return [];
            }

            $ids = $products->pluck('prod_id')->map(fn ($id) => (int) $id)->all();
            $variations = Prodvar::whereIn('prod_id', $ids)
                ->whereNull('prodvar_deleted')
                ->orderBy('prodvar_id')
                ->get()
                ->groupBy('prod_id');
            $breakdowns = self::ratingBreakdowns($ids);
            $sold       = self::salesByProduct();

            return $products->map(function (Product $product) use ($variations, $breakdowns, $sold) {
                return self::present(
                    $product,
                    $variations->get($product->prod_id) ?? collect(),
                    $breakdowns[(int) $product->prod_id] ?? null,
                    ['sold' => $sold[(int) $product->prod_id] ?? 0]
                );
            })->all();
        }

        /**
         * Approved-only rating breakdown per product: [5 => n, 4 => n, ...].
         * Mirrors Review's "<rating>|<message>" encoding without hydrating models.
         */
        public static function ratingBreakdowns(array $prodIds): array
        {
            $prodIds = array_values(array_unique(array_filter(array_map('intval', $prodIds))));
            if ($prodIds === []) {
                return [];
            }

            $out = [];
            foreach ($prodIds as $prodId) {
                $out[$prodId] = [
                    'breakdown' => [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0],
                    'count' => 0,
                    'sum' => 0,
                    'average' => 0.0,
                ];
            }

            $rows = DB::table('reviews')
                ->whereIn('prod_id', $prodIds)
                ->whereNotNull('rev_approved')
                ->get(['prod_id', 'rev_msg']);

            foreach ($rows as $row) {
                $rating = self::ratingToken($row->rev_msg);
                if ($rating < 1 || $rating > 5) {
                    continue;
                }

                $slot = $out[(int) $row->prod_id] ?? null;
                if ($slot === null) {
                    continue;
                }

                $slot['breakdown'][$rating]++;
                $slot['count']++;
                $slot['sum'] += $rating;
                $out[(int) $row->prod_id] = $slot;
            }

            foreach ($out as $prodId => $slot) {
                $out[$prodId]['average'] = $slot['count'] > 0
                    ? round($slot['sum'] / $slot['count'], 2)
                    : 0.0;
            }

            return $out;
        }

        /** The 1-5 token carried by a rev_msg (rejected rows keep the original). */
        public static function ratingToken(?string $revMsg): int
        {
            $raw = (string) $revMsg;
            if (str_starts_with($raw, '[REJECTED]')) {
                $raw = ltrim(substr($raw, strlen('[REJECTED]')));
                if (str_starts_with($raw, '|')) {
                    $raw = substr($raw, 1);
                }
            }

            $head = explode('|', $raw, 2)[0];

            return is_numeric($head) ? max(1, min(5, (int) $head)) : 0;
        }

        /** Images are stored as /uploads/... paths or base64 data URLs. */
        protected static function imageAllowed($value): bool
        {
            $value = trim((string) $value);
            if ($value === '') {
                return true;
            }
            if (preg_match('#^data:image/(jpe?g|png);#i', $value)) {
                return true;
            }

            $path = parse_url($value, PHP_URL_PATH);
            if (! is_string($path) || $path === '') {
                $path = $value;
            }

            return (bool) preg_match('/\.(jpe?g|png)$/i', $path);
        }

        /**
         * REQ-ADD_PROD-07: format AND file size are validated before an image
         * is accepted. Uploaded paths are checked by the upload endpoint; this
         * guards the inline base64 form the admin form still sends (a 2 MB
         * decoded ceiling keeps one product row from bloating the table).
         */
        protected static function imageWithinSize($value): bool
        {
            $value = trim((string) $value);
            if ($value === '' || ! preg_match('#^data:image/#i', $value)) {
                return true; // an /uploads path carries no inline payload
            }

            return strlen($value) <= self::MAX_IMAGE_B64_CHARS;
        }

        /** 2 MB decoded ~= 2.7M base64 characters. */
        protected const MAX_IMAGE_B64_CHARS = 2800000;

        /**
         * REQ-ADD_PROD-04: categories are predefined and system-wide. Every
         * spelling the admin UI offers (singular, plural, legacy) folds onto
         * one canonical value, and anything outside the list is rejected with
         * the list itself, so `prod_categ` can never drift into free text.
         */
        protected static function categoryWhitelist(): array
        {
            return [
                'Shirts', 'Hoodies', 'Jackets', 'Varsity Jacket', 'Caps',
                'Lanyards', 'Pins', 'Stickers', 'Accessories', 'Windbreaker',
                'Others',
            ];
        }

        /** Alias -> canonical category name (lowercase keys). */
        protected static function normalizeCategory(?string $raw): string
        {
            $value = trim((string) $raw);
            if ($value === '') {
                return 'Others';
            }

            $aliases = [
                'shirt'        => 'Shirts',
                'shirts'       => 'Shirts',
                'hoodie'       => 'Hoodies',
                'hoodies'      => 'Hoodies',
                'jacket'       => 'Jackets',
                'jackets'      => 'Jackets',
                'varsity'      => 'Varsity Jacket',
                'varsity jacket' => 'Varsity Jacket',
                'cap'          => 'Caps',
                'caps'         => 'Caps',
                'lanyard'      => 'Lanyards',
                'lanyards'     => 'Lanyards',
                'pin'          => 'Pins',
                'pins'         => 'Pins',
                'sticker'      => 'Stickers',
                'stickers'     => 'Stickers',
                'accessory'    => 'Accessories',
                'accessories'  => 'Accessories',
                'windbreaker'  => 'Windbreaker',
                'others'       => 'Others',
            ];

            return $aliases[strtolower($value)] ?? $value;
        }

        /**
         * @return string|null the canonical category, or null (with $message
         *         filled in) when the value is outside the whitelist.
         */
        protected static function validatedCategory($raw, ?string &$message = null): ?string
        {
            $categ = self::normalizeCategory($raw);

            if (! in_array($categ, self::categoryWhitelist(), true)) {
                $message = 'Unknown product category "' . $categ
                    . '". Allowed categories: ' . implode(', ', self::categoryWhitelist()) . '.';

                return null;
            }

            return $categ;
        }

        // ==========================================
        // CATALOG / INVENTORY
        // ==========================================

        /*
            Adding product to catalog/inventory
            ----------
            JSON REQUEST

            prod_name - string (req)
            prod_tag - string (opt - generated when missing; UNIQUE)
            prod_categ - string (opt)
            prod_price - numeric (req, must be > 0)
            prod_desc - string (opt)
            prod_qty - integer (opt - stock for the default variation)
            prod_images - array (opt - jpg/png only)
            variations - array (opt)
                each: prodvar_name, prodvar_stock, prodvar_pic, prodvar_markup,
                      prodvar_options, prodvar_preorder, prodvar_main
                At least one variation is required (built from prod_qty when the
                caller only speaks the legacy dialect).
        */
        public function addProduct(Request $json)
        {
            $validator = (new DatabaseAPI())->addProduct($json);
            if ($validator) return $validator;

            $name = trim((string) $json->input('prod_name', ''));
            if ($name === '') {
                return response()->json(['success' => false, 'message' => 'Product name is required.'], 400);
            }

            // prod_name and prod_tag are UNIQUE in the schema; the storefront
            // treats "SHIRT" and "shirt" as the same product, so the check is
            // case-insensitive.
            if (Product::whereRaw('lower(prod_name) = lower(?)', [$name])->exists()) {
                return response()->json(['success' => false, 'message' => 'Product name already exists.'], 409);
            }

            $tag = trim((string) $json->input('prod_tag', ''));
            if ($tag !== '') {
                if (Product::whereRaw('lower(prod_tag) = lower(?)', [$tag])->exists()) {
                    return response()->json(['success' => false, 'message' => 'Product tag already exists.'], 409);
                }
            } else {
                $tag = $this->uniqueTag($name);
            }

            $priceInput = $json->input('prod_price');
            if ($priceInput === null || $priceInput === '' || ! is_numeric($priceInput)) {
                return response()->json(['success' => false, 'message' => 'Product price must be a number.'], 400);
            }
            $price = round((float) $priceInput, 2);
            if ($price <= 0) {
                return response()->json(['success' => false, 'message' => 'Product price must be greater than zero.'], 422);
            }

            $variations = $this->parseVariations($json);
            if ($variations instanceof \Illuminate\Http\JsonResponse) {
                return $variations;
            }
            if (count($variations) < 1) {
                return response()->json(['success' => false, 'message' => 'A product needs at least one variation.'], 422);
            }

            // REQ-ADD_PROD-04: categories are a predefined, system-wide set.
            $categError = null;
            $categ = self::validatedCategory($json->input('prod_categ'), $categError);
            if ($categ === null) {
                return response()->json(['success' => false, 'message' => $categError], 422);
            }

            // REQ-ADD_PROD-07: format + size are validated before the row is
            // written (format in parseVariations, size here).
            foreach ((array) ($json->input('prod_images') ?: []) as $image) {
                if (! self::imageWithinSize($image)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product images must be 2 MB or smaller.',
                    ], 422);
                }
            }

            try {
                $product = DB::transaction(function () use ($json, $name, $tag, $price, $variations, $categ) {
                    $product = Product::create([
                        'prod_name'     => $name,
                        'prod_tag'      => $tag,
                        'prod_categ'    => $categ,
                        'prod_price'    => $price,
                        'prod_desc'     => $json->input('prod_desc'),
                        'prod_rating'   => 0,
                        'prod_reviews'  => 0,
                        'prod_total_var' => count($variations),
                        'prod_created'  => now(),
                        'prod_disabled' => null, // active (REQ-MANAGE_INV-02)
                        'prod_deleted'  => null,
                    ]);

                    foreach ($variations as $variation) {
                        Prodvar::create($variation + [
                            'prod_id'          => $product->prod_id,
                            'prodvar_created'  => now(),
                            'prodvar_disabled' => null,
                            'prodvar_deleted'  => null,
                        ]);
                    }

                    return $product->fresh();
                });

                $totalStock = (int) Prodvar::where('prod_id', $product->prod_id)->sum('prodvar_stock');
                $threshold = (int) SystemSettings::get('low_stock_threshold', 5);
                if ($totalStock <= $threshold) {
                    $this->notifyEmployeesByType(
                        ['ADMIN', 'SUPER ADMIN'],
                        '[PRIORITY] Low stock: "' . $product->prod_name . '" is now down to ' . $totalStock . ' unit(s).'
                    );
                }

                $this->logInventory($json, 'add', 'products/add - "' . $product->prod_name . '" (#' . $product->prod_id . ')');

                return response()->json([
                    'success' => true,
                    'message' => 'Product added to catalog successfully',
                    'data'    => self::present($product),
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to add product',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Displaying orders from catalog/inventory
            ----------
            JSON REQUEST (Optional filters)

            prod_id - integer (opt)

            Items no longer carry prod_id: the chain is orders -> items -> bag
            -> prodvar -> product, and quantity/amount live on the bag row.
        */
        public function displayOrders(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = DB::table('orders')
                    ->join('items', 'orders.ord_id', '=', 'items.ord_id')
                    ->join('bag', 'items.bag_id', '=', 'bag.bag_id')
                    ->join('prodvar', 'bag.prodvar_id', '=', 'prodvar.prodvar_id')
                    ->join('product', 'prodvar.prod_id', '=', 'product.prod_id');

                if ($prodId) {
                    $query->where('product.prod_id', $prodId);
                }

                $orders = $query->select(
                    'orders.ord_id',
                    'orders.cust_id',
                    'orders.ord_created',
                    'orders.ord_status',
                    'orders.ord_amount',
                    'orders.ord_claiming',
                    'orders.pay_reference',
                    'product.prod_name',
                    'product.prod_id',
                    'prodvar.prodvar_id',
                    'prodvar.prodvar_name',
                    'items.item_created',
                    'bag.bag_qty as item_qty',
                    'bag.bag_amount as item_amount'
                )->distinct()->orderBy('orders.ord_created', 'desc')->get();

                // REQ-ACCESS_LOG-01: reading the inventory/orders list is logged.
                $this->logView($json, 'inventory');

                return response()->json([
                    'success' => true,
                    'message' => 'Orders retrieved successfully',
                    'data'    => $orders,
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to retrieve orders',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            FLOW-MANAGE_INV-08: sales history for each product - daily units,
            revenue and a trend, aggregated from `prodsales` (REQ-MANAGE_INV-06:
            metrics are NEVER read from the legacy peak/today columns).

            GET /products/sales?prod_id=&days=&date_from=&date_to=

            prod_id  - integer (opt: one product, else every product)
            days     - integer (opt: window length ending today, default 30)
            date_from/date_to - Y-m-d (opt: explicit window, overrides `days`)
        */
        public function productSales(Request $json)
        {
            try {
                $prodId = (int) $json->input('prod_id', 0);

                $from = filled($json->input('date_from'))
                    ? (string) $json->input('date_from')
                    : now()->subDays(max(1, (int) $json->input('days', 30)))->toDateString();
                $to = filled($json->input('date_to'))
                    ? (string) $json->input('date_to')
                    : now()->toDateString();

                $query = DB::table('prodsales')
                    ->join('prodvar', 'prodvar.prodvar_id', '=', 'prodsales.prodvar_id')
                    ->join('product', 'product.prod_id', '=', 'prodvar.prod_id')
                    ->whereNull('product.prod_deleted')
                    ->where('prodsales.prodsales_date', '>=', $from)
                    ->where('prodsales.prodsales_date', '<=', $to);

                if ($prodId > 0) {
                    $query->where('prodvar.prod_id', $prodId);
                }

                $rows = $query
                    ->select('prodvar.prod_id as pid')
                    ->selectRaw('DATE(prodsales.prodsales_date) as day')
                    ->selectRaw('COALESCE(SUM(prodsales_qty), 0) as qty')
                    ->selectRaw('COALESCE(SUM(prodsales_amount), 0) as revenue')
                    ->selectRaw('COALESCE(SUM(prodsales_bag), 0) as bags')
                    ->selectRaw('COALESCE(SUM(prodsales_walkin), 0) as walkin')
                    ->selectRaw('COALESCE(SUM(prodsales_preorder), 0) as preorder')
                    ->selectRaw('COALESCE(SUM(prodsales_cancelled), 0) as cancelled')
                    ->groupBy('prodvar.prod_id', 'DATE(prodsales.prodsales_date)')
                    ->orderBy('day')
                    ->get();

                $byProduct = [];
                foreach ($rows as $row) {
                    $pid = (int) $row->pid;
                    $byProduct[$pid] ??= [
                        'prod_id'   => $pid,
                        'prod_name' => Product::where('prod_id', $pid)->value('prod_name'),
                        'total_qty' => 0,
                        'total_revenue' => 0.0,
                        'days'      => [],
                    ];
                    $byProduct[$pid]['total_qty']     += (int) $row->qty;
                    $byProduct[$pid]['total_revenue']  = round($byProduct[$pid]['total_revenue'] + (float) $row->revenue, 2);
                    $byProduct[$pid]['days'][] = [
                        'date'     => (string) $row->day,
                        'qty'      => (int) $row->qty,
                        'revenue'  => round((float) $row->revenue, 2),
                        'bags'     => (int) $row->bags,
                        'walkin'   => (int) $row->walkin,
                        'preorder' => (int) $row->preorder,
                        'cancelled'=> (int) $row->cancelled,
                    ];
                }

                // FLOW-MANAGE_INV-08 asks for trends: compare the second half
                // of the window against the first half, per product.
                foreach ($byProduct as &$entry) {
                    $days = $entry['days'];
                    $half = intdiv(count($days), 2);
                    $early = array_sum(array_column(array_slice($days, 0, $half), 'qty'));
                    $late  = array_sum(array_column(array_slice($days, $half), 'qty'));
                    $entry['trend'] = [
                        'early_qty' => $early,
                        'late_qty'  => $late,
                        'direction' => $late > $early ? 'up' : ($late < $early ? 'down' : 'flat'),
                        'delta'     => $late - $early,
                    ];
                }
                unset($entry);

                $this->logInventory($json, 'view', 'products/sales - ' . $from . '..' . $to);

                return response()->json([
                    'success' => true,
                    'message' => 'Product sales history retrieved successfully',
                    'data'    => array_values($byProduct),
                    'date_range' => ['from' => $from, 'to' => $to],
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to retrieve product sales history',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Filtering the catalog/inventory
            ----------
            JSON REQUEST

            category - string (opt)
            status - string (opt) - e.g., 'active', 'disabled', 'deleted', 'all'
            stock - string (opt) - e.g., 'in_stock', 'out_of_stock', 'low_stock'
            low_stock_threshold - integer (opt, default: low_stock_threshold setting)
        */
        public function filterCatalog(Request $json)
        {
            try {
                $categ = $json->input('category');
                $status = $json->input('status');
                $stock = $json->input('stock');
                $lowStockThreshold = (int) ($json->input('low_stock_threshold')
                    ?? SystemSettings::get('low_stock_threshold', 5));

                $query = Product::query();
                $isEmployee = $this->isEmployee($json->user('api'));
                if (! $isEmployee) {
                    // REQ-MANAGE_INV-02: customers never see disabled/deleted rows.
                    $status = 'active';
                }

                if ($categ) {
                    $query->where('prod_categ', $categ);
                }

                if ($status === 'disabled') {
                    $query->whereNotNull('prod_disabled');
                } elseif ($status === 'deleted') {
                    $query->whereNotNull('prod_deleted');
                } elseif ($status === 'active' || !$status) {
                    $query->whereNull('prod_disabled')->whereNull('prod_deleted');
                }

                // D19: the catalog is ordered by name.
                $products = $query->orderBy('prod_name')->get();
                $rows = self::presentMany($products);

                // Stock filters run against SUM(prodvar.prodvar_stock).
                if ($stock === 'in_stock') {
                    $rows = array_values(array_filter($rows, fn ($row) => (int) $row['prod_qty'] > 0));
                } elseif ($stock === 'out_of_stock') {
                    $rows = array_values(array_filter($rows, fn ($row) => (int) $row['prod_qty'] === 0));
                } elseif ($stock === 'low_stock') {
                    $rows = array_values(array_filter(
                        $rows,
                        fn ($row) => (int) $row['prod_qty'] <= $lowStockThreshold
                    ));
                }

                // REQ-ACCESS_LOG-01: reading the catalog is logged.
                $this->logView($json, 'catalog');

                return response()->json([
                    'success' => true,
                    'message' => 'Catalog filtered successfully',
                    'data'    => $rows,
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to filter catalog',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Category list for the inventory / catalog filters
            ----------
            GET /products/categories - no body.

            REQ-ADD_PROD-04: the predefined set, merged with any distinct
            value already sitting on a live row (deduplicated
            case-insensitively), so a filter can always match real data.
        */
        public function productCategories(Request $json)
        {
            try {
                $inUse = Product::whereNull('prod_deleted')
                    ->distinct()
                    ->pluck('prod_categ')
                    ->filter(fn ($c) => $c !== null && trim((string) $c) !== '')
                    ->map(fn ($c) => trim((string) $c))
                    ->all();

                $merged = [];
                foreach (array_merge(self::categoryWhitelist(), $inUse) as $categ) {
                    $key = strtolower($categ);
                    if (! isset($merged[$key])) {
                        $merged[$key] = $categ;
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Categories loaded successfully',
                    'data'    => array_values($merged),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to load categories',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Removing product from catalog/inventory
            ----------
            JSON REQUEST

            prod_id - integer (req)
        */
        public function removeProduct(Request $json)
        {
            $prodId = $json->input('prod_id');
            if (!$prodId) {
                return response()->json(['success' => false, 'message' => 'Product ID is required'], 400);
            }

            try {
                $product = Product::find($prodId);
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $product->update(['prod_deleted' => now()]);

                $this->logInventory($json, 'delete', 'products/remove - "' . $product->prod_name . '" (#' . $product->prod_id . ')');

                return response()->json([
                    'success' => true,
                    'message' => 'Product removed from the catalog',
                    'data'    => self::present($product->fresh()),
                ]);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to remove product',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Searching products
            ----------
            JSON REQUEST

            q - string (opt)
        */
        public function searchProducts(Request $json)
        {
            try {
                $q = $json->input('q');
                $query = Product::query();
                if (! $this->isEmployee($json->user('api'))) {
                    $query->whereNull('prod_disabled')->whereNull('prod_deleted');
                }

                if ($q) {
                    // ilike is PostgreSQL-only; SQLite/MySQL use LIKE, which is
                    // already case-insensitive for ASCII.
                    $op = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
                    $query->where(function($query) use ($q, $op) {
                        $query->where('prod_name', $op, "%{$q}%")
                              ->orWhere('prod_tag', $op, "%{$q}%")
                              ->orWhere('prod_desc', $op, "%{$q}%");
                    });
                }

                // REQ-ACCESS_LOG-01: reading the catalog search is logged.
                $this->logView($json, 'catalog search');

                return response()->json([
                    'success' => true,
                    'message' => 'Search completed',
                    'data'    => self::presentMany($query->orderBy('prod_name')->get()),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Search failed',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Sorting products
            ----------
            JSON REQUEST

            sort_by - string (opt) - 'name', 'price', 'qty', 'created', 'popularity'
            order - string (opt) - 'asc' or 'desc'

            'qty' and 'popularity' no longer map to a column: quantity is
            SUM(prodvar.prodvar_stock) and popularity is SUM(prodsales_qty).
        */
        public function sortProducts(Request $json)
        {
            try {
                $sortBy = $json->input('sort_by', 'name');
                $order = strtolower($json->input('order', 'asc')) === 'desc' ? 'desc' : 'asc';
                $dir = $order === 'desc' ? -1 : 1;

                $columnMap = [
                    'name'    => 'prod_name',
                    'price'   => 'prod_price',
                    'created' => 'prod_created',
                ];
                $column = $columnMap[$sortBy] ?? 'prod_name';

                $query = Product::query();
                if (! $this->isEmployee($json->user('api'))) {
                    $query->whereNull('prod_disabled')->whereNull('prod_deleted');
                }
                $rows = self::presentMany($query->get());

                if ($sortBy === 'qty') {
                    usort($rows, fn ($a, $b) => $dir * ((int) $a['prod_qty'] <=> (int) $b['prod_qty']));
                } elseif ($sortBy === 'popularity') {
                    $sold = self::salesByProduct();
                    usort($rows, function ($a, $b) use ($dir, $sold) {
                        $left = $sold[(int) ($a['prod_id'] ?? 0)] ?? 0;
                        $right = $sold[(int) ($b['prod_id'] ?? 0)] ?? 0;

                        return $dir * ($left <=> $right);
                    });
                } else {
                    usort($rows, function ($a, $b) use ($column, $dir) {
                        if ($column === 'prod_name') {
                            return $dir * strcasecmp((string) ($a[$column] ?? ''), (string) ($b[$column] ?? ''));
                        }
                        if ($column === 'prod_created') {
                            return $dir * (strcmp((string) ($a[$column] ?? ''), (string) ($b[$column] ?? '')));
                        }

                        return $dir * (((float) ($a[$column] ?? 0)) <=> ((float) ($b[$column] ?? 0)));
                    });
                }

                // REQ-ACCESS_LOG-01: reading the sorted catalog is logged.
                $this->logView($json, 'catalog sort');

                return response()->json([
                    'success' => true,
                    'message' => 'Products sorted successfully',
                    'data'    => $rows,
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to sort products',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Updating product details
            ----------
            JSON REQUEST

            prod_id - integer (req)
            prod_name / prod_tag / prod_categ / prod_price / prod_desc - opt
            prod_qty - integer (opt, legacy: total stock across variations)
            prod_images - array (opt, legacy: first image becomes the main
                          variation's picture)
            variations - array (opt: replaces the variation rows)
        */
        public function updateProductDetails(Request $json)
        {
            $validator = (new DatabaseAPI())->updateProductDetails($json);
            if ($validator) return $validator;

            try {
                $product = Product::find($json->input('prod_id'));
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $updateData = [];
                $fields = ['prod_name', 'prod_tag', 'prod_categ', 'prod_price', 'prod_desc'];

                foreach ($fields as $field) {
                    if ($json->has($field)) {
                        $updateData[$field] = $json->input($field);
                    }
                }

                // The validator's `unique` rule is case-sensitive, so the
                // schema-level UNIQUE constraint needs its own guard here.
                foreach (['prod_name', 'prod_tag'] as $uniqueField) {
                    if (! array_key_exists($uniqueField, $updateData)) {
                        continue;
                    }
                    $value = trim((string) $updateData[$uniqueField]);
                    if ($value === '') {
                        return response()->json([
                            'success' => false,
                            'message' => ucfirst($uniqueField) . ' cannot be empty.',
                        ], 422);
                    }
                    $clash = Product::where('prod_id', '!=', $product->prod_id)
                        ->whereRaw('lower(' . $uniqueField . ') = lower(?)', [$value])
                        ->exists();
                    if ($clash) {
                        return response()->json([
                            'success' => false,
                            'message' => ucfirst($uniqueField) . ' already exists.',
                        ], 409);
                    }
                }

                if (array_key_exists('prod_categ', $updateData)) {
                    // REQ-ADD_PROD-04: same predefined category set as add.
                    $categError = null;
                    $categ = self::validatedCategory($updateData['prod_categ'], $categError);
                    if ($categ === null) {
                        return response()->json(['success' => false, 'message' => $categError], 422);
                    }
                    $updateData['prod_categ'] = $categ;
                }

                if (array_key_exists('prod_price', $updateData)) {
                    if (! is_numeric($updateData['prod_price']) || (float) $updateData['prod_price'] <= 0) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Product price must be greater than zero.',
                        ], 422);
                    }
                    $updateData['prod_price'] = round((float) $updateData['prod_price'], 2);
                }

                $product->update($updateData);

                // Legacy stock / photo edits are redirected onto the variations.
                $stockChanged = false;
                if ($json->has('prodvar_id') && $json->has('prod_qty')) {
                    // The inventory stepper points at ONE variation, so the
                    // absolute value lands on that row instead of being spread
                    // over the main variation by applyTotalStock().
                    $variationTarget = (int) $json->input('prod_qty');
                    if ($variationTarget < 0) {
                        return response()->json(['success' => false, 'message' => 'Product quantity cannot be negative.'], 422);
                    }
                    $stockChanged = $this->applyVariationStock(
                        $product,
                        (int) $json->input('prodvar_id'),
                        $variationTarget
                    );
                    if ($stockChanged === null) {
                        return response()->json(['success' => false, 'message' => 'Product variation not found for this product.'], 422);
                    }
                } elseif ($json->has('prod_qty')) {
                    $target = (int) $json->input('prod_qty');
                    if ($target < 0) {
                        return response()->json(['success' => false, 'message' => 'Product quantity cannot be negative.'], 422);
                    }
                    $stockChanged = $this->applyTotalStock($product, $target);
                }

                if ($json->has('prod_images')) {
                    $images = $json->input('prod_images');
                    $images = is_array($images) ? $images : (filled($images) ? [$images] : []);
                    $first = $images[0] ?? null;
                    if (filled($first) && ! self::imageAllowed($first)) {
                        return response()->json(['success' => false, 'message' => 'Images must be JPG or PNG files.'], 422);
                    }
                    foreach ($images as $image) {
                        if (! self::imageWithinSize($image)) {
                            return response()->json([
                                'success' => false,
                                'message' => 'Product images must be 2 MB or smaller.',
                            ], 422);
                        }
                    }
                    if (filled($first)) {
                        $this->applyMainImage($product, (string) $first);
                    }
                }

                if ($json->has('variations') || $json->input('prodvar') !== null) {
                    $variations = $this->parseVariations($json);
                    if ($variations instanceof \Illuminate\Http\JsonResponse) {
                        return $variations;
                    }
                    $this->replaceVariations($product, $variations);
                    $stockChanged = true;
                }

                $product->refresh();
                self::syncTotals($product);

                if ($stockChanged) {
                    $stock = $product->totalStock();
                    $threshold = (int) SystemSettings::get('low_stock_threshold', 5);
                    if ($stock <= $threshold) {
                        $this->notifyEmployeesByType(
                            ['ADMIN', 'SUPER ADMIN'],
                            '[PRIORITY] Low stock: "' . $product->prod_name . '" is now down to ' . $stock . ' unit(s).'
                        );
                    }
                }

                $changed = array_merge(
                    array_keys($updateData),
                    $stockChanged ? ['prod_qty'] : [],
                    $json->has('variations') || $json->input('prodvar') !== null ? ['variations'] : [],
                    $json->has('prod_images') ? ['prod_images'] : []
                );
                $this->logInventory(
                    $json,
                    'edit',
                    'products/update - "' . $product->prod_name . '" (#' . $product->prod_id . ')'
                        . ($changed !== [] ? ' [' . implode(', ', array_unique($changed)) . ']' : '')
                );

                return response()->json([
                    'success' => true,
                    'message' => 'Product details updated successfully',
                    'data'    => self::present($product->fresh()),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update product details',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Viewing product details
            ----------
            JSON REQUEST

            prod_id - integer (opt)
            prod_tag - string (opt)
        */
        public function viewProductDetails(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');
                $prodTag = $json->input('prod_tag');

                $query = Product::query();
                if (! $this->isEmployee($json->user('api'))) {
                    $query->whereNull('prod_disabled')->whereNull('prod_deleted');
                }

                if ($prodId) {
                    $query->where('prod_id', $prodId);
                } elseif ($prodTag) {
                    $query->where('prod_tag', $prodTag);
                } else {
                    return response()->json([
                        'success' => false,
                        'message' => 'Either prod_id or prod_tag must be provided'
                    ], 400);
                }

                $product = $query->first();

                if (!$product) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product not found'
                    ], 404);
                }

                // REQ-ACCESS_LOG-01: opening a product page is logged.
                $this->logView($json, 'product');

                return response()->json([
                    'success' => true,
                    'message' => 'Product details retrieved successfully',
                    'data'    => self::present($product),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to retrieve product details',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Unlisting a product (custom option for updating status)
            ----------
            JSON REQUEST

            prod_id - integer (req)
        */
        public function unlistProduct(Request $json)
        {
            $prodId = $json->input('prod_id');
            if (!$prodId) {
                return response()->json(['success' => false, 'message' => 'Product ID is required'], 400);
            }

            try {
                $product = Product::find($prodId);
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                // REQ-MANAGE_INV-02: disabled the moment this lands, so the
                // customer catalog drops it on the next read.
                $product->update(['prod_disabled' => now()]);

                $this->logInventory($json, 'edit', 'products/unlist - "' . $product->prod_name . '" (#' . $product->prod_id . ')');

                return response()->json([
                    'success' => true,
                    'message' => 'Product unlisted successfully',
                    'data'    => self::present($product->fresh()),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to unlist product',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Selling/listing a product back in catalog
            ----------
            JSON REQUEST

            prod_id - integer (req)
        */
        public function sellProduct(Request $json)
        {
            $prodId = $json->input('prod_id');
            if (!$prodId) {
                return response()->json(['success' => false, 'message' => 'Product ID is required'], 400);
            }

            try {
                $product = Product::find($prodId);
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $product->update([
                    'prod_disabled' => null,
                    'prod_deleted' => null
                ]);

                $this->logInventory($json, 'edit', 'products/sell - relisted "' . $product->prod_name . '" (#' . $product->prod_id . ')');

                return response()->json([
                    'success' => true,
                    'message' => 'Product listed for sale successfully',
                    'data'    => self::present($product->fresh()),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to list product for sale',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        // ==========================================
        // HELPERS
        // ==========================================

        /**
         * REQ-MANAGE_INV-05: every inventory change lands in `emplog`. The
         * caller's employee id is optional (some legacy routes carry no
         * token), in which case nothing is written rather than a row with a
         * fabricated id.
         */
        protected function logInventory(Request $json, string $access, string $what): void
        {
            $user = $json->user('api');
            if ($user instanceof \App\Models\Employee) {
                $this->logEmployee((int) $user->emp_id, $access, $what);
            }
        }

        /**
         * Reads the variation rows out of a payload. When the caller only
         * speaks the legacy dialect (prod_qty + prod_images) a single default
         * variation is synthesised, so "at least one variation" always holds.
         *
         * @return array|\Illuminate\Http\JsonResponse
         */
        protected function parseVariations(Request $json)
        {
            $raw = $json->input('variations') ?? $json->input('prodvar') ?? $json->input('vars');

            if ($raw !== null && ! is_array($raw)) {
                return response()->json(['success' => false, 'message' => 'variations must be an array.'], 422);
            }

            $rows = [];
            foreach ((array) $raw as $index => $row) {
                if (! is_array($row)) {
                    return response()->json(['success' => false, 'message' => 'Each variation must be an object.'], 422);
                }

                $stock = $row['prodvar_stock'] ?? $row['stock'] ?? 0;
                if (! is_numeric($stock) || (int) $stock < 0) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Variation stock must be a non-negative number.',
                    ], 422);
                }

                $markup = $row['prodvar_markup'] ?? $row['markup'] ?? 0;
                if ($markup !== null && $markup !== '' && ! is_numeric($markup)) {
                    return response()->json(['success' => false, 'message' => 'Variation markup must be a number.'], 422);
                }

                $pic = $row['prodvar_pic'] ?? $row['pic'] ?? $row['image'] ?? null;
                if (filled($pic) && ! self::imageAllowed($pic)) {
                    return response()->json(['success' => false, 'message' => 'Images must be JPG or PNG files.'], 422);
                }
                if (filled($pic) && ! self::imageWithinSize($pic)) {
                    return response()->json(['success' => false, 'message' => 'Product images must be 2 MB or smaller.'], 422);
                }

                $rows[] = [
                    'prodvar_name'     => trim((string) ($row['prodvar_name'] ?? $row['name'] ?? ''))
                        ?: ('Variation ' . ($index + 1)),
                    'prodvar_pic'      => filled($pic) ? $pic : null,
                    'prodvar_stock'    => (int) $stock,
                    'prodvar_main'     => (bool) ($row['prodvar_main'] ?? $row['main'] ?? false),
                    'prodvar_markup'   => ($markup === null || $markup === '') ? 0.0 : round((float) $markup, 2),
                    'prodvar_options'  => $row['prodvar_options'] ?? $row['options'] ?? null,
                    'prodvar_preorder' => (bool) ($row['prodvar_preorder'] ?? $row['preorder'] ?? false),
                ];
            }

            if ($rows === []) {
                $images = $json->input('prod_images');
                $images = is_array($images) ? $images : (filled($images) ? [$images] : []);
                $pic = $images[0] ?? null;
                if (filled($pic) && ! self::imageAllowed($pic)) {
                    return response()->json(['success' => false, 'message' => 'Images must be JPG or PNG files.'], 422);
                }
                if (filled($pic) && ! self::imageWithinSize($pic)) {
                    return response()->json(['success' => false, 'message' => 'Product images must be 2 MB or smaller.'], 422);
                }

                $rows[] = [
                    'prodvar_name'     => 'Standard',
                    'prodvar_pic'      => filled($pic) ? $pic : null,
                    'prodvar_stock'    => max(0, (int) $json->input('prod_qty', 0)),
                    'prodvar_main'     => true,
                    'prodvar_markup'   => 0.0,
                    'prodvar_options'  => null,
                    'prodvar_preorder' => (bool) $json->input('prod_preorder', false),
                ];
            }

            // Exactly one main variation: the first flag wins, the rest are
            // cleared, and a payload with none gets the first row marked.
            $mainSeen = false;
            foreach ($rows as $index => $row) {
                if (! $row['prodvar_main']) {
                    continue;
                }
                if ($mainSeen) {
                    $rows[$index]['prodvar_main'] = false;
                    continue;
                }
                $mainSeen = true;
            }
            if (! $mainSeen) {
                $rows[0]['prodvar_main'] = true;
            }

            return $rows;
        }

        /** A unique prod_tag derived from the name (prod_tag is UNIQUE). */
        protected function uniqueTag(string $name): string
        {
            $base = strtoupper((string) preg_replace('/[^A-Za-z0-9]+/', '', $name));
            if ($base === '') {
                $base = 'PROD';
            }
            $base = substr($base, 0, 24);

            $tag = $base;
            $attempt = 1;
            while (Product::whereRaw('lower(prod_tag) = lower(?)', [$tag])->exists()) {
                $tag = $base . '-' . $attempt++;
                if ($attempt > 500) {
                    $tag = $base . '-' . strtoupper(Str::random(6));
                    break;
                }
            }

            return $tag;
        }

        /**
         * Legacy `prod_qty` writes: move the delta onto the main variation so
         * SUM(prodvar.prodvar_stock) ends up at the requested total.
         */
        protected function applyTotalStock(Product $product, int $target): bool
        {
            $vars = Prodvar::where('prod_id', $product->prod_id)
                ->whereNull('prodvar_deleted')
                ->orderBy('prodvar_id')
                ->get();

            if ($vars->isEmpty()) {
                return false;
            }

            $delta = $target - (int) $vars->sum('prodvar_stock');
            if ($delta === 0) {
                return false;
            }

            $carrier = $vars->first(fn (Prodvar $v) => (bool) $v->prodvar_main) ?? $vars->first();
            $carrier->update(['prodvar_stock' => max(0, (int) $carrier->prodvar_stock + $delta)]);

            return true;
        }

        /**
         * Per-variation stock write: the inventory stepper adds/removes a piece
         * from ONE variation, so the absolute value is written to that row
         * directly instead of moving a delta onto the main variation.
         *
         * Returns null when the variation does not belong to this product.
         */
        protected function applyVariationStock(Product $product, int $prodvarId, int $target): ?bool
        {
            $variation = Prodvar::where('prod_id', $product->prod_id)
                ->where('prodvar_id', $prodvarId)
                ->whereNull('prodvar_deleted')
                ->first();

            if (!$variation) {
                return null;
            }

            if ((int) $variation->prodvar_stock === $target) {
                return false;
            }

            $variation->update(['prodvar_stock' => $target]);

            return true;
        }

        /** Legacy `prod_images` writes: the first image becomes the main pic. */
        protected function applyMainImage(Product $product, string $image): void
        {
            $main = Prodvar::where('prod_id', $product->prod_id)
                ->whereNull('prodvar_deleted')
                ->orderByRaw('prodvar_main desc')
                ->orderBy('prodvar_id')
                ->first();

            $main?->update(['prodvar_pic' => $image]);
        }

        /** Full variation replacement when the payload carries `variations`. */
        protected function replaceVariations(Product $product, array $variations): void
        {
            Prodvar::where('prod_id', $product->prod_id)->whereNull('prodvar_deleted')
                ->update(['prodvar_deleted' => now()]);

            foreach ($variations as $variation) {
                Prodvar::create($variation + [
                    'prod_id'          => $product->prod_id,
                    'prodvar_created'  => now(),
                    'prodvar_disabled' => null,
                    'prodvar_deleted'  => null,
                ]);
            }
        }

        /** Keeps the denormalised aggregate columns honest after any change. */
        protected static function syncTotals(Product $product): void
        {
            $product->update([
                'prod_total_var' => Prodvar::where('prod_id', $product->prod_id)
                    ->whereNull('prodvar_deleted')
                    ->count(),
            ]);
        }

        /** SUM(prodsales_qty) per product - the old prod_peaksold successor. */
        protected static function salesByProduct(): array
        {
            $rows = DB::table('prodsales')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'prodsales.prodvar_id')
                ->groupBy('prodvar.prod_id')
                ->select('prodvar.prod_id as pid')
                ->selectRaw('COALESCE(SUM(prodsales_qty), 0) as sold')
                ->get();

            $out = [];
            foreach ($rows as $row) {
                $out[(int) $row->pid] = (int) $row->sold;
            }

            return $out;
        }

    // ===== from the Reviews API file =====
/**
     * DOMAIN 13 (REVIEWS).
     *
     * Reviews live in `reviews`; there is no rating column, so the rating
     * travels inside rev_msg as a "<rating>|<message>" token (see
     * Review::compose). Pending = rev_approved IS NULL, approved = a stamp,
     * rejected = rev_msg prefixed with "[REJECTED] |" which keeps the row for
     * audit (REQ-MANAGE_REV-03) while hiding it from customers
     * (FLOW-MANAGE_REV-07).
     *
     * Every read answers with BOTH the canonical fields (rating / message) and
     * the legacy order-shaped ones the current frontend still renders
     * (ord_rating / ord_review / ord_completed / ord_id / status).
     */

    // ===== from the Reviews API file =====

        // Order statuses that do not represent a completed purchase. The new
        // vocabulary keeps the old meaning: a cart still being processed, a
        // cancellation request and a cancelled order never count.
        protected const NOT_PURCHASED = ['processing', 'to cancel', 'cancelled'];

        // ==========================================
        // ENCODING / PRESENTATION
        // ==========================================

        protected function countsAsPurchase($status): bool
        {
            return ! in_array($this->purchaseStatusKey($status), self::NOT_PURCHASED, true);
        }

        /**
         * Folds the legacy spellings of a status onto the new vocabulary so the
         * NOT_PURCHASED list stays exhaustive for rows written before the rename.
         */
        protected function purchaseStatusKey($status): string
        {
            $key = strtolower(trim((string) $status));

            return match ($key) {
                'to process', 'pending' => 'processing',
                'cancel requested', 'cancellation requested' => 'to cancel',
                'canceled' => 'cancelled',
                default => $key,
            };
        }

        /** Splits rev_msg into its rating token, text and rejection marker. */
        protected function decode(?string $revMsg): array
        {
            $raw = (string) $revMsg;
            $rejected = false;

            if (str_starts_with($raw, '[REJECTED]')) {
                $rejected = true;
                $raw = ltrim(substr($raw, strlen('[REJECTED]')));
                if (str_starts_with($raw, '|')) {
                    $raw = substr($raw, 1);
                }
            }

            $parts = explode('|', $raw, 2);
            $rating = is_numeric($parts[0] ?? '') ? max(1, min(5, (int) $parts[0])) : 0;

            if (count($parts) === 2) {
                $text = $parts[1];
            } else {
                $text = $rating > 0 ? '' : $raw;
            }

            return ['rating' => $rating, 'text' => $text, 'rejected' => $rejected];
        }

        /** Canonical + legacy aliases for one review row. */
        protected function reviewsPresent(Review $review, ?int $ordId = null): array
        {
            $decoded = $this->decode($review->rev_msg);
            $status = $review->rev_approved !== null
                ? 'approved'
                : ($decoded['rejected'] ? 'rejected' : 'pending');

            // The admin queue still derives its state from ord_review, so a
            // rejected row keeps the historical sentinel there while the real
            // text stays available under `message` for audit.
            $legacyText = $status === 'rejected' ? '[REVIEW CENSORED]' : $decoded['text'];

            // FLOW-MANAGE_REV-02: the admin list shows product name and
            // customer name per row (eager-loaded by displayReviews).
            $product  = $review->product;
            $customer = $review->customer;

            return [
                'rev_id'       => (int) $review->rev_id,
                'cust_id'      => (int) $review->cust_id,
                'prod_id'      => (int) $review->prod_id,
                'rev_created'  => optional($review->rev_created)->toDateTimeString(),
                'rev_approved' => optional($review->rev_approved)->toDateTimeString(),

                // FLOW-MANAGE_REV-02 / FLOW-MANAGE_REV-04 display columns
                'prod_name'    => $product?->prod_name,
                'cust_name'    => $customer
                    ? trim(($customer->cust_nickname ?: $customer->cust_givname) . ' ' . $customer->cust_surname)
                    : null,
                // Canonical read model
                'rating'       => $decoded['rating'],
                'message'      => $decoded['text'],
                'status'       => $status,

                // Legacy order-shaped aliases (spec section 6)
                'ord_id'       => $ordId,
                'ord_rating'   => $decoded['rating'],
                'ord_review'   => $legacyText,
                // The old list showed the order's completion date; the review
                // timestamp is the only equivalent the new schema carries.
                'ord_completed' => optional($review->rev_created)->toDateTimeString(),
            ];
        }

        // ==========================================
        // RESOLUTION HELPERS
        // ==========================================

        // The customer account behind the bearer token, or a 403 response
        protected function requireCustomer(Request $json)
        {
            $user = $json->user('api');
            if (! $user instanceof Customer) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only customer accounts may submit reviews',
                ], 403);
            }

            return $user;
        }

        /** Product ids inside one order: orders -> items -> bag -> prodvar. */
        protected function productIdsForOrder(int $ordId): array
        {
            return DB::table('items')
                ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'bag.prodvar_id')
                ->where('items.ord_id', $ordId)
                ->distinct()
                ->pluck('prodvar.prod_id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }

        /**
         * Newest order per (customer, product) so the legacy ord_id handle can
         * travel with every review row without an N+1.
         */
        protected function orderMap($reviews): array
        {
            $reviews = collect($reviews);
            if ($reviews->isEmpty()) {
                return [];
            }

            $custIds = $reviews->pluck('cust_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
            $prodIds = $reviews->pluck('prod_id')->map(fn ($id) => (int) $id)->unique()->values()->all();

            $rows = DB::table('orders')
                ->join('items', 'items.ord_id', '=', 'orders.ord_id')
                ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'bag.prodvar_id')
                ->whereIn('orders.cust_id', $custIds)
                ->whereIn('prodvar.prod_id', $prodIds)
                ->groupBy('orders.cust_id', 'prodvar.prod_id')
                ->select('orders.cust_id as cust_id', 'prodvar.prod_id as prod_id')
                ->selectRaw('MAX(orders.ord_id) as ord_id')
                ->get();

            $map = [];
            foreach ($rows as $row) {
                $map[(int) $row->cust_id][(int) $row->prod_id] = (int) $row->ord_id;
            }

            return $map;
        }

        /** The order id behind one review, from the map built above. */
        protected function orderIdFor(Review $review, array $map): ?int
        {
            return $map[(int) $review->cust_id][(int) $review->prod_id] ?? null;
        }

        /**
         * Resolves the review a payload points at. `rev_id` is canonical;
         * the legacy dialect sends `ord_id` (+ optional prod_id), which is
         * mapped back through items -> bag -> prodvar.
         *
         * The legacy handle is ambiguous by construction: one order buys
         * several products, so without `prod_id` the newest row of ANY of
         * them was silently picked - moderating (or deleting) the wrong
         * review. When the order holds more than one product and no `prod_id`
         * was sent, the caller is told to disambiguate instead of guessing.
         *
         * @return Review|\Illuminate\Http\JsonResponse|null
         */
        protected function resolveReview(Request $json)
        {
            $revId = $json->input('rev_id');
            if ($revId !== null && $revId !== '') {
                return Review::find($revId);
            }

            $ordId = $json->input('ord_id');
            if (! $ordId) {
                return null;
            }

            $order = Order::find($ordId);
            if (! $order) {
                return null;
            }

            $prodIds = $this->productIdsForOrder((int) $order->ord_id);
            $prodId = $json->input('prod_id');
            if ($prodId) {
                $prodIds = [(int) $prodId];
            }
            if ($prodIds === []) {
                return null;
            }

            if (count($prodIds) > 1 && ! $prodId) {
                return response()->json([
                    'success' => false,
                    'message' => 'This order holds ' . count($prodIds)
                        . ' products. Send `prod_id` (or the rev_id of the review) so the right review is targeted.',
                    'code'    => 'AMBIGUOUS_REVIEW',
                    'prod_ids'=> $prodIds,
                ], 409);
            }

            return Review::where('cust_id', $order->cust_id)
                ->whereIn('prod_id', $prodIds)
                ->orderByDesc('rev_created')
                ->first();
        }

        /** REQ-MANAGE_REV-03: rows deleted by moderation keep their text. */
        protected function isDeleted(Review $review): bool
        {
            return str_starts_with((string) $review->rev_msg, '[DELETED]');
        }

        /**
         * REQ-MANAGE_REV-05: product.prod_rating is the average of APPROVED
         * ratings and product.prod_reviews the count of APPROVED rows, so
         * moderation can never corrupt them.
         */
        protected function recomputeProduct(int $prodId): void
        {
            $rows = Review::where('prod_id', $prodId)
                ->whereNotNull('rev_approved')
                ->whereRaw("rev_msg NOT LIKE '[DELETED]%'")
                ->get(['rev_msg']);

            $count = $rows->count();
            $sum = 0;
            foreach ($rows as $row) {
                $sum += $this->decode($row->rev_msg)['rating'];
            }

            Product::where('prod_id', $prodId)->update([
                'prod_rating' => $count > 0 ? round($sum / $count, 2) : 0,
                'prod_reviews' => $count,
            ]);
        }

        // ==========================================
        // ENDPOINTS
        // ==========================================

        /*
            Creating product reviews
            ----------
            JSON REQUEST

            ord_id - integer (opt: legacy handle, one of ord_id / prod_id)
            prod_id - integer (opt: one of ord_id / prod_id)
            rating - integer (req: 1-5)   [legacy: ord_rating]
            message - string (opt)        [legacy: ord_review / review]

            One review per customer per product; every submission waits for
            employee approval (rev_approved stays NULL).
        */
        public function createReview(Request $json)
        {
            $validator = (new DatabaseAPI())->createReview($json);
            if ($validator) return $validator;

            $customer = $this->requireCustomer($json);
            if ($customer instanceof \Illuminate\Http\JsonResponse) return $customer;

            $ratingInput = $json->input('rating', $json->input('ord_rating'));
            if ($ratingInput === null) {
                return response()->json(['success' => false, 'message' => 'Rating score is required.'], 400);
            }
            if (! is_numeric($ratingInput) || (int) $ratingInput < 1 || (int) $ratingInput > 5) {
                return response()->json([
                    'success' => false,
                    'message' => 'Rating must be a number between 1 and 5.',
                ], 400);
            }
            $rating = (int) $ratingInput;

            $text = (string) ($json->input('message')
                ?? $json->input('review')
                ?? $json->input('ord_review')
                ?? '');

            $ordId = $json->input('ord_id');
            $prodId = $json->input('prod_id');

            if (! $ordId && ! $prodId) {
                return response()->json(['success' => false, 'message' => 'Order ID or product ID is required.'], 400);
            }

            try {
                if ($ordId) {
                    $order = Order::find($ordId);
                    if (! $order) {
                        return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                    }

                    // Only the purchaser may review their own order
                    if ((int) $order->cust_id !== (int) $customer->getKey()) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review your own orders',
                        ], 403);
                    }

                    if (! $this->countsAsPurchase($order->ord_status)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased',
                        ], 403);
                    }

                    $orderProducts = $this->productIdsForOrder((int) $order->ord_id);
                    if ($prodId) {
                        if (! in_array((int) $prodId, $orderProducts, true)) {
                            return response()->json([
                                'success' => false,
                                'message' => 'The requested product is not part of this order',
                            ], 403);
                        }
                        $prodId = (int) $prodId;
                    } else {
                        if ($orderProducts === []) {
                            return response()->json([
                                'success' => false,
                                'message' => 'The requested product is not part of this order',
                            ], 403);
                        }
                        $prodId = $orderProducts[0];
                    }
                } else {
                    $product = Product::find($prodId);
                    if (! $product) {
                        return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                    }

                    // Purchase rule: a review is only allowed once the order
                    // was actually paid for (still-processing and cancelled
                    // orders never count as a purchase)
                    $placeholders = implode(',', array_fill(0, count(self::NOT_PURCHASED), '?'));
                    $purchased = DB::table('orders')
                        ->join('items', 'items.ord_id', '=', 'orders.ord_id')
                        ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                        ->join('prodvar', 'prodvar.prodvar_id', '=', 'bag.prodvar_id')
                        ->where('orders.cust_id', $customer->getKey())
                        ->where('prodvar.prod_id', $prodId)
                        ->whereRaw('LOWER(orders.ord_status) NOT IN (' . $placeholders . ')', self::NOT_PURCHASED)
                        ->exists();

                    if (! $purchased) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased',
                        ], 403);
                    }

                    $prodId = (int) $prodId;
                }

                // REQ-APC-2 / Domain 13: only one review per customer per
                // product. A rejected row keeps its audit trail but does not
                // block a fresh submission.
                $existing = Review::where('cust_id', $customer->getKey())
                    ->where('prod_id', $prodId)
                    ->orderByDesc('rev_created')
                    ->first();

                if ($existing && ! $existing->isRejected()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You have already reviewed this product. Please edit your existing review instead.',
                    ], 409);
                }

                $review = Review::create([
                    'cust_id'     => $customer->getKey(),
                    'prod_id'     => $prodId,
                    'rev_msg'     => Review::compose($rating, $text),
                    'rev_created' => now(),
                    'rev_approved' => null,
                ]);

                $map = $this->orderMap([$review]);

                return response()->json([
                    'success' => true,
                    'message' => 'Review and rating submitted successfully',
                    'data'    => $this->reviewsPresent($review, $ordId ?: $this->orderIdFor($review, $map)),
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Deleting product reviews
            ----------
            JSON REQUEST

            rev_id - integer (canonical)
            ord_id - integer (legacy handle, + optional prod_id)

            Customers may only delete their own rows; employees may delete any.
            The product aggregates are recomputed afterwards.
        */
        public function deleteReview(Request $json)
        {
            $validator = (new DatabaseAPI())->deleteReview($json);
            if ($validator) return $validator;

            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review; // ambiguous legacy handle (409)
                }
                if (! $review) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                $user = $json->user('api');
                $ownsReview = $user instanceof Customer && (int) $review->cust_id === (int) $user->getKey();
                if (! $ownsReview && ! $this->isEmployee($user)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You may only delete your own reviews',
                    ], 403);
                }

                if ($this->isDeleted($review)) {
                    return response()->json([
                        'success' => true,
                        'message' => 'Review deleted successfully',
                    ], 200);
                }

                $prodId = (int) $review->prod_id;

                // REQ-MANAGE_REV-03: a moderation delete is a SOFT delete -
                // the row stays in `reviews` (its text survives under a
                // [DELETED] marker) so the audit trail the SRS asks for
                // still exists, while every read below filters it out.
                $review->rev_msg = '[DELETED] ' . (string) $review->rev_msg;
                $review->rev_approved = null;
                $review->save();
                $this->recomputeProduct($prodId);

                // REQ-MANAGE_REV-04: approve / reject / delete all land in emplog.
                if ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'delete',
                        'DELETE /api/reviews/delete - soft-deleted review #' . $review->rev_id
                        . ' (product #' . $prodId . ')');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review deleted successfully',
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to delete review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Displaying product reviews
            ----------
            JSON REQUEST / Query Params

            prod_id - integer (opt)
            status - string (opt: pending | approved | rejected | all, employees only)

            FLOW-CATALOG-05: customers and guests only ever see approved rows,
            newest first.
        */
        public function displayReviews(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');
                $user = $json->user('api');
                $isEmployee = $this->isEmployee($user);
                $isAdmin = $this->isAdmin($user);
                $statusFilter = strtolower(trim((string) $json->input('status', '')));
                $q = trim((string) $json->input('q', ''));

                $query = Review::with(['product', 'customer']);
                if ($prodId) {
                    $query->where('prod_id', $prodId);
                }

                // REQ-MANAGE_REV-03: a soft-deleted row is gone from every
                // read - customer wall, admin queue and search alike.
                $query->whereRaw("rev_msg NOT LIKE '[DELETED]%'");

                /*
                    FLOW-MANAGE_REV-01: the admin page opens on the whole
                    queue. An empty `status` used to fall through to the
                    customer branch (approved only), so the pending rows the
                    page exists for never appeared until a filter was picked.
                */
                if ($isEmployee && $statusFilter === '' && $isAdmin) {
                    $statusFilter = 'all';
                }

                $wantsQueue = $isEmployee
                    && in_array($statusFilter, ['pending', 'approved', 'rejected', 'all'], true);

                if ($wantsQueue) {
                    if ($statusFilter === 'pending') {
                        $query->whereNull('rev_approved')
                            ->whereRaw("rev_msg NOT LIKE '[REJECTED]%'");
                    } elseif ($statusFilter === 'approved') {
                        $query->whereNotNull('rev_approved');
                    } elseif ($statusFilter === 'rejected') {
                        $query->whereNull('rev_approved')
                            ->whereRaw("rev_msg LIKE '[REJECTED]%'");
                    }
                } else {
                    // REQ-MANAGE_REV-02: pending and rejected rows never reach
                    // a customer, whatever status they asked for.
                    $query->whereNotNull('rev_approved');
                }

                // FLOW-MANAGE_REV-04: search by product name or customer name
                // (the admin page sends `q`; `search` is the older alias).
                $needle = $q !== '' ? $q : trim((string) $json->input('search', ''));
                if ($needle !== '') {
                    $query->where(function ($builder) use ($needle) {
                        $builder->whereHas('product', function ($pq) use ($needle) {
                            $pq->where('prod_name', 'like', "%{$needle}%")
                               ->orWhere('prod_tag', 'like', "%{$needle}%");
                        })->orWhereHas('customer', function ($cq) use ($needle) {
                            $cq->where('cust_nickname', 'like', "%{$needle}%")
                               ->orWhere('cust_email', 'like', "%{$needle}%")
                               ->orWhere('cust_givname', 'like', "%{$needle}%")
                               ->orWhere('cust_surname', 'like', "%{$needle}%");
                        });
                    });
                }

                $query->orderByDesc('rev_created');
                $reviews = $query->get();

                $map = $this->orderMap($reviews);
                $rows = $reviews
                    ->map(fn (Review $review) => $this->reviewsPresent($review, $this->orderIdFor($review, $map)))
                    ->values();

                // REQ-ACCESS_LOG-01: reading reviews (customer wall or the
                // moderation queue) is logged on the reading account.
                $this->logView($json, 'reviews');

                return response()->json([
                    'success' => true,
                    'message' => 'Product reviews retrieved successfully',
                    'data'    => $rows,
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display reviews',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Moderating product reviews
            ----------
            JSON REQUEST

            rev_id - integer (canonical)
            ord_id - integer (legacy handle, + optional prod_id)
            approve - boolean (opt, default: true)
            censored_review - string (opt, replacement text)

            approve=true  -> rev_approved = now() (published)
            approve=false -> rev_msg = '[REJECTED] |' + original, keeping the
                             row for audit with rev_approved NULL
        */
        public function moderateReview(Request $json)
        {
            $validator = (new DatabaseAPI())->moderateReview($json);
            if ($validator) return $validator;

            // Only employees review submissions before they go public
            $denied = $this->requireEmployee($json);
            if ($denied) return $denied;

            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review; // ambiguous legacy handle (409)
                }
                if (! $review) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                $approve = $json->boolean('approve', true);
                $decoded = $this->decode($review->rev_msg);
                $censored = $json->input('censored_review');
                $text = $censored !== null ? (string) $censored : $decoded['text'];
                $rating = $decoded['rating'] > 0 ? $decoded['rating'] : 1;

                if ($approve) {
                    // Approving a previously rejected row restores a clean
                    // "<rating>|<text>" token (no marker survives).
                    $review->rev_msg = Review::compose($rating, $text);
                    $review->rev_approved = now();
                    $newStatus = 'approved';
                } else {
                    if (! str_starts_with((string) $review->rev_msg, '[REJECTED]')) {
                        $review->rev_msg = '[REJECTED] |' . $review->rev_msg;
                    }
                    $review->rev_approved = null;
                    $newStatus = 'rejected';
                }

                $review->save();
                $this->recomputeProduct((int) $review->prod_id);

                if ($review->cust_id) {
                    $product = Product::find($review->prod_id);
                    $label = $product ? '"' . $product->prod_name . '"' : 'your order';
                    $this->notifyCustomer((int) $review->cust_id, $approve
                        ? 'Your review for ' . $label . ' has been approved.'
                        : 'Your review for ' . $label . ' was not approved.');
                }

                // REQ-ACCESS_LOG-01/03: moderating a review is an edit action.
                $user = $json->user('api');
                if ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'edit',
                        'POST /api/reviews/moderate - ' . $newStatus . ' review #' . $review->rev_id);
                }

                $ordId = $json->input('ord_id');
                $map = $this->orderMap([$review]);

                return response()->json([
                    'success' => true,
                    'message' => 'Review moderation completed',
                    'data'    => $this->reviewsPresent($review, $ordId ?: $this->orderIdFor($review, $map)),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to moderate review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Scoring product ratings
            ----------
            JSON REQUEST / Query Params

            prod_id - integer (opt)

            Only approved feedback contributes to the public score.
        */
        public function scoreRating(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = Review::whereNotNull('rev_approved')
                    // REQ-MANAGE_REV-03: soft-deleted rows never score.
                    ->whereRaw("rev_msg NOT LIKE '[DELETED]%'");
                if ($prodId) {
                    $query->where('prod_id', $prodId);
                }

                $rows = $query->get(['rev_msg']);
                $sum = 0;
                $scored = 0;
                foreach ($rows as $row) {
                    $rating = $this->decode($row->rev_msg)['rating'];
                    if ($rating > 0) {
                        $sum += $rating;
                        $scored++;
                    }
                }

                $average = $scored > 0 ? round($sum / $scored, 2) : 0.0;

                return response()->json([
                    'success' => true,
                    'message' => 'Rating score calculated successfully',
                    'data'    => [
                        'prod_id'         => $prodId,
                        'average_rating'  => $average,
                        'total_reviews'   => $rows->count(),
                        // Canonical aliases of the same two numbers
                        'prod_rating'     => $average,
                        'prod_reviews'    => $rows->count(),
                    ],
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to calculate score rating',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Updating product reviews
            ----------
            JSON REQUEST

            rev_id - integer (canonical)
            ord_id - integer (legacy handle, + optional prod_id)
            rating - integer (opt 1-5)   [legacy: ord_rating]
            message - string (opt)       [legacy: ord_review / review]

            Editing stops once an employee approved (or rejected) it; a pending
            edit keeps the row pending.
        */
        public function updateReview(Request $json)
        {
            $validator = (new DatabaseAPI())->updateReview($json);
            if ($validator) return $validator;

            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review; // ambiguous legacy handle (409)
                }
                if (! $review) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                $user = $json->user('api');
                if (! $user instanceof Customer || (int) $review->cust_id !== (int) $user->getKey()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You may only edit your own reviews',
                    ], 403);
                }

                $decoded = $this->decode($review->rev_msg);
                if ($review->rev_approved !== null || $decoded['rejected']) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Approved reviews can no longer be edited',
                    ], 409);
                }

                $rating = $decoded['rating'];
                if ($json->has('rating')) {
                    $rating = $json->input('rating');
                } elseif ($json->has('ord_rating')) {
                    $rating = $json->input('ord_rating');
                }

                if (! is_numeric($rating) || (int) $rating < 1 || (int) $rating > 5) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Rating must be a number between 1 and 5.',
                    ], 400);
                }

                $text = $decoded['text'];
                if ($json->has('message')) {
                    $text = (string) $json->input('message');
                } elseif ($json->has('review')) {
                    $text = (string) $json->input('review');
                } elseif ($json->has('ord_review')) {
                    $text = (string) $json->input('ord_review');
                }

                $review->rev_msg = Review::compose((int) $rating, (string) $text);
                $review->rev_approved = null; // an edit always re-enters the queue
                $review->save();

                $this->recomputeProduct((int) $review->prod_id);

                $map = $this->orderMap([$review]);

                return response()->json([
                    'success' => true,
                    'message' => 'Review updated successfully',
                    'data'    => $this->reviewsPresent($review, $this->orderIdFor($review, $map)),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

    // ===== from the Upload API file =====
/**
 * DOMAIN 6-ish file handling: images are stored on THIS backend's disk
 * (storage/app/public/uploads/<type>/) and served from /storage/...
 *
 * There is no Supabase storage bucket anywhere in this flow (SPEC: 18 tables,
 * no bucket config) — a write failure degrades to a self-contained base64 data
 * URL so the caller still gets a usable `url` instead of a 500.
 */

    // ===== from the Upload API file =====

    /** Images only, and at most 2 MB each. */
    private const RULES = ['required', 'image', 'mimes:png,jpg,jpeg,gif,webp', 'max:2048'];

    /**
     * POST /uploads - accept an actual image file, persist it under
     * storage/app/public/uploads/<type>/, and return its public URL.
     *
     * multipart/form-data
     *   file - image (png/jpg/jpeg/gif/webp, max 2MB) (req)
     *   type - subfolder: avatar | product | banner ... (opt)
     */
    public function uploadImage(Request $request)
    {
        $validator = Validator::make($request->all(), ['file' => self::RULES]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first('file'),
            ], 422);
        }

        try {
            $type = preg_replace('/[^a-z0-9_-]/i', '', (string) $request->input('type', 'general')) ?: 'general';
            $file = $request->file('file');
            $extension = strtolower($file->getClientOriginalExtension() ?: 'png');
            if (!in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
                $extension = 'png';
            }

            // Unique name: no two uploads can ever collide, no clock reuse.
            $filename = now()->format('Ymd_His') . '_' . substr(md5(uniqid('', true)), 0, 8)
                . '.' . $extension;

            $path = false;
            try {
                $path = $file->storeAs('uploads/' . $type, $filename, 'public');
            } catch (\Throwable $e) {
                $path = false;
            }

            if ($path) {
                return response()->json([
                    'success' => true,
                    'message' => 'File uploaded successfully',
                    'data' => [
                        'url'     => $request->getSchemeAndHttpHost() . '/storage/' . $path,
                        'path'    => $path,
                        'storage' => 'public',
                    ],
                ], 200);
            }

            // Write failure (read-only disk, missing link, quota...): hand back
            // a data URL so the caller still has something usable to render.
            $mime = $file->getMimeType() ?: 'image/' . $extension;
            $dataUrl = 'data:' . $mime . ';base64,' . base64_encode((string) $file->get());

            return response()->json([
                'success' => true,
                'message' => 'File stored inline (local storage unavailable)',
                'data' => [
                    'url'     => $dataUrl,
                    'path'    => null,
                    'storage' => 'base64',
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload file',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }
}
