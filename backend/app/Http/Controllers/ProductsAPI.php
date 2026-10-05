<?php

    namespace App\Http\Controllers;

    use App\Models\Prodvar;
    use App\Models\Product;
    use App\Support\SystemSettings;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Str;

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
    class ProductsAPI extends Controller
    {
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
         */
        public static function present(Product $product, $variations = null, ?array $breakdown = null): array
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

            return $products->map(function (Product $product) use ($variations, $breakdowns) {
                return self::present(
                    $product,
                    $variations->get($product->prod_id) ?? collect(),
                    $breakdowns[(int) $product->prod_id] ?? null
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

            try {
                $product = DB::transaction(function () use ($json, $name, $tag, $price, $variations) {
                    $product = Product::create([
                        'prod_name'     => $name,
                        'prod_tag'      => $tag,
                        'prod_categ'    => $json->input('prod_categ') ?: 'others',
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
            $validator = (new InputValidatorAPI())->updateProductDetails($json);
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
                if ($json->has('prod_qty')) {
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
    }
