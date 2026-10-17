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

class ProductsAPI extends Controller
{

    private static function presentMemo(): \ArrayObject
    {
        $request = app()->bound('request') ? app('request') : null;

        if ($request === null) {
            return new \ArrayObject();
        }

        $key = 'products.present.memo';
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, new \ArrayObject());
        }

        return $request->attributes->get($key);
    }

        public static function present(Product $product, $variations = null, ?array $breakdown = null, ?array $metrics = null): array
        {
            $defaultRender = $variations === null && $breakdown === null && $metrics === null;
            $memo = $defaultRender ? self::presentMemo() : null;
            if ($defaultRender && $memo->offsetExists((int) $product->prod_id)) {
                return $memo[(int) $product->prod_id];
            }

            $vars = $variations === null
                ? Prodvar::where('prod_id', $product->prod_id)
                    ->whereNull('prodvar_deleted')
                    ->orderBy('prodvar_id')
                    ->get()
                : collect($variations);

            $stock = (int) $vars->sum('prodvar_stock');
            $vars->each(function (Prodvar $v) {
                $v->prodvar_pic = self::publicPicture($v->prodvar_pic);
            });

            $images = $vars->pluck('prodvar_pic')
                ->filter(fn ($pic) => filled($pic))
                ->unique()
                ->values();
            $main = $vars->first(fn (Prodvar $v) => (bool) $v->prodvar_main);
            $mainImage = ($main !== null && filled($main->prodvar_pic)) ? $main->prodvar_pic : $images->first();

            $payload = $product->attributesToArray();
            $payload['prod_categ'] = self::normalizeCategory(
                (string) $product->prod_categ,
                (string) $product->prod_name
            );

            $variationsPayload = $vars->map(function (Prodvar $variation) use ($product) {
                $row = $variation->attributesToArray();
                $row['unit_price'] = round((float) $product->prod_price + (float) ($variation->prodvar_markup ?? 0), 2);
                $row['available'] = $variation->prodvar_disabled === null;

                $options = self::decodeOptions($variation->prodvar_options);
                $row['options'] = $options;
                $row['option_label'] = self::optionLabel($options, (string) $variation->prodvar_name);
                $row['option_axes'] = array_keys($options);

                return $row;
            })->values()->all();

            $payload['variations'] = $variationsPayload;
            $payload['prodvar'] = $variationsPayload;

            $payload['option_axes'] = self::optionAxes($vars);

            $payload['prod_qty'] = $stock;
            $payload['prod_status'] = $stock > 0 ? 'In Stock' : 'Out of Stock';
            $payload['prod_images'] = $images->all() ?: null;
            $sizeAxis = self::optionAxisNamed($payload['option_axes'], self::sizeKeys);
            $payload['prod_sizes'] = ($sizeAxis
                ? $vars->map(fn (Prodvar $v) => self::decodeOptions($v->prodvar_options)[$sizeAxis] ?? null)
                    ->filter()->unique()->values()->all()
                : $vars->pluck('prodvar_name')->filter()->unique()->values()->all()) ?: null;
            $payload['prod_colors'] = self::colorSwatches($vars, $payload['option_axes']);
            $payload['prod_stock_matrix'] = $vars->mapWithKeys(
                fn (Prodvar $v) => [$v->prodvar_name => (int) $v->prodvar_stock]
            )->all();
            $payload['prod_preorder'] = (bool) $vars->contains(fn (Prodvar $v) => (bool) $v->prodvar_preorder);
            $payload['main_image'] = $mainImage;

            $payload['prod_reviews'] = (int) $product->prod_reviews;
            $payload['prod_review_count'] = (int) $product->prod_reviews;
            $payload['prod_rating'] = round((float) $product->prod_rating, 2);
            $payload['prod_total_var'] = (int) $product->prod_total_var > 0
                ? (int) $product->prod_total_var
                : $vars->count();

            $sold = $metrics['sold'] ?? $product->totalSold();
            $payload['stock']    = $stock;
            $payload['prod_peaksold'] = $sold;
            $payload['prod_sold']     = $sold;

            $threshold = (int) (\App\Support\SystemSettings::get('low_stock_threshold', 5));
            $payload['low_stock'] = $stock <= $threshold;
            $payload['low_stock_threshold'] = $threshold;

            if ($breakdown === null) {
                $breakdown = self::ratingBreakdowns([(int) $product->prod_id])[(int) $product->prod_id] ?? null;
            }
            if ($breakdown !== null) {
                $payload['prod_rating_breakdown'] = $breakdown['breakdown'];
            }

            $visible = $vars->filter(fn (Prodvar $v) => $v->prodvar_disabled === null);
            $payload['available'] = $product->isBuyable() && $visible->isNotEmpty();
            $payload['unavailable'] = ! $payload['available'];

            if ($defaultRender) {
                $memo[(int) $product->prod_id] = $payload;
            }

            return $payload;
        }

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
            $sold       = self::salesForProducts($ids);

            return $products->map(function (Product $product) use ($variations, $breakdowns, $sold) {
                return self::present(
                    $product,
                    $variations->get($product->prod_id) ?? collect(),
                    $breakdowns[(int) $product->prod_id] ?? null,
                    ['sold' => $sold[(int) $product->prod_id] ?? 0]
                );
            })->all();
        }

        public static function primePresentations($products): void
        {
            $list = collect($products)
                ->filter(fn ($p) => $p instanceof Product)
                ->unique(fn (Product $p) => (int) $p->prod_id)
                ->values();

            if ($list->isEmpty()) {
                return;
            }

            $memo = self::presentMemo();
            foreach (self::presentMany($list) as $index => $payload) {
                $product = $list[$index] ?? null;
                if ($product instanceof Product) {
                    $memo[(int) $product->prod_id] = $payload;
                }
            }
        }

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

        public static function publicPicture($value)
        {
            $value = trim((string) $value);
            if ($value === '' || preg_match('#^(data:|https?:|//)#i', $value)) {
                return $value === '' ? null : $value;
            }

            $path = str_starts_with($value, '/storage/')
                ? ltrim($value, '/')
                : 'storage/' . ltrim($value, '/');

            return self::publicUrl($path);
        }

        protected static function imageWithinSize($value): bool
        {
            $value = trim((string) $value);
            if ($value === '' || ! preg_match('#^data:image/#i', $value)) {
                return true;
            }

            return strlen($value) <= self::maxImageB64Chars;
        }

        protected const maxImageB64Chars = 2800000;

        public static function categoryWhitelist(): array
        {
            return [
                'Shirts', 'Hoodies', 'Jackets', 'Caps', 'Lanyards',
                'Stickers', 'Pins', 'Totebags', 'Keychains',
            ];
        }

        public static function normalizeCategory(?string $raw, ?string $productName = null): string
        {
            $value = strtolower(trim((string) $raw));
            $value = preg_replace('/[_-]+/', ' ', $value);
            $value = preg_replace('/\s+/', ' ', $value);

            $aliases = [
                'shirt'        => 'Shirts',
                'shirts'       => 'Shirts',
                'hoodie'       => 'Hoodies',
                'hoodies'      => 'Hoodies',
                'jacket'       => 'Jackets',
                'jackets'      => 'Jackets',
                'varsity'      => 'Jackets',
                'varsity jacket' => 'Jackets',
                'varsity jackets' => 'Jackets',
                'windbreaker'  => 'Jackets',
                'windbreakers' => 'Jackets',
                'cap'          => 'Caps',
                'caps'         => 'Caps',
                'lanyard'      => 'Lanyards',
                'lanyards'     => 'Lanyards',
                'pin'          => 'Pins',
                'pins'         => 'Pins',
                'sticker'      => 'Stickers',
                'stickers'     => 'Stickers',
                'tote bag'     => 'Totebags',
                'tote bags'    => 'Totebags',
                'totebag'      => 'Totebags',
                'totebags'     => 'Totebags',
                'key chain'    => 'Keychains',
                'key chains'   => 'Keychains',
                'keychain'     => 'Keychains',
                'keychains'    => 'Keychains',
                'accessory'    => 'Accessories',
                'accessories'  => 'Accessories',
                'others'       => 'Accessories',
            ];

            $category = $aliases[$value] ?? $value;
            if ($category !== '' && $category !== 'Accessories') {
                return $category;
            }

            $name = strtolower((string) $productName);
            if (str_contains($name, 'lanyard')) return 'Lanyards';
            if (str_contains($name, 'tote')) return 'Totebags';
            if (str_contains($name, 'key chain') || str_contains($name, 'keychain')) return 'Keychains';
            if (str_contains($name, 'sticker')) return 'Stickers';
            if (str_contains($name, 'pin') || str_contains($name, 'badge')) return 'Pins';
            if (str_contains($name, 'cap')) return 'Caps';

            return $category === '' ? 'Accessories' : $category;
        }

        public static function validatedCategory($raw, ?string &$message = null): ?string
        {
            $categ = self::normalizeCategory($raw);

            if (! in_array($categ, self::categoryWhitelist(), true) && $categ !== 'Accessories') {
                $message = 'Unknown product category "' . $categ
                    . '". Allowed categories: ' . implode(', ', self::categoryWhitelist()) . '.';

                return null;
            }

            return $categ;
        }

        protected const maxVariations = 500;

        protected const maxOptionAxes = 4;

        protected const maxOptionChars = 40;

        protected const sizeKeys = ['size', 'sizes'];
        protected const colorKeys = ['color', 'colour', 'colors', 'colours'];

        public static function optionValue($raw): string
        {
            return trim((string) preg_replace('/\s+/u', ' ', (string) $raw));
        }

        public static function normalizeOptions($raw): ?array
        {
            if ($raw === null || $raw === '') {
                return null;
            }

            $pairs = [];

            if (is_string($raw)) {
                $trimmed = trim($raw);
                if ($trimmed === '') {
                    return null;
                }

                $decoded = json_decode($trimmed, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $raw = $decoded;
                } else {
                    foreach (preg_split('/[;,]/', $trimmed) as $chunk) {
                        if (! str_contains($chunk, '=') && ! str_contains($chunk, ':')) {
                            return null;
                        }
                        [$axis, $value] = array_pad(preg_split('/=|:/', $chunk, 2), 2, '');
                        $pairs[self::optionValue($axis)] = self::optionValue($value);
                    }
                    $raw = $pairs;
                }
            }

            if (! is_array($raw)) {
                return null;
            }

            $isList = array_keys($raw) === range(0, count($raw) - 1);

            foreach ($raw as $axis => $value) {
                if ($isList) {
                    if (is_array($value)) {
                        $axis  = $value['name'] ?? $value['axis'] ?? $value['key'] ?? null;
                        $value = $value['value'] ?? $value['option'] ?? $value['val'] ?? null;
                    } elseif (is_string($value) && str_contains($value, '=')) {
                        [$axis, $value] = explode('=', $value, 2);
                    } else {
                        return null;
                    }
                    if ($axis === null || $value === null) {
                        return null;
                    }
                }

                $pairs[self::optionValue($axis)] = self::optionValue($value);
            }

            return self::collectOptions($pairs);
        }

        public static function collectOptions(array $pairs): array
        {
            $out = [];
            $spelling = [];

            foreach ($pairs as $axis => $value) {
                $key = strtolower((string) $axis);
                if ($key === '') {
                    continue;
                }
                $out[$spelling[$key] ?? (string) $axis] = self::optionValue($value);
                $spelling[$key] ??= (string) $axis;
            }

            return $out;
        }

        public static function variationOptions($raw): array
        {
            if ($raw === null || $raw === '' || $raw === []) {
                return [[], null];
            }

            $options = self::normalizeOptions($raw);

            if ($options === null) {
                return [[], 'Variation options must be a map such as {"Color":"Cream","Size":"Medium"}.'];
            }

            if ($options === []) {
                return [[], 'Every variation option needs both an axis name and a value.'];
            }

            if (count($options) > self::maxOptionAxes) {
                return [[], 'A variation can vary along at most ' . self::maxOptionAxes . ' axes at once.'];
            }

            foreach ($options as $axis => $value) {
                if (mb_strlen($axis) > self::maxOptionChars
                    || mb_strlen((string) $value) > self::maxOptionChars) {
                    return [[], 'A variation option axis and value must be '
                        . self::maxOptionChars . ' characters or fewer.'];
                }

                if (preg_match('/[\x00-\x1f\x7f]/', $axis . (string) $value)) {
                    return [[], 'A variation option cannot contain control characters.'];
                }
            }

            return [$options, null];
        }

        public static function encodeOptions(array $options): ?string
        {
            if ($options === []) {
                return null;
            }

            ksort($options, SORT_NATURAL | SORT_FLAG_CASE);

            return json_encode($options, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        public static function decodeOptions($raw): array
        {
            if ($raw === null || $raw === '') {
                return [];
            }
            if (is_array($raw)) {
                return $raw;
            }

            $decoded = json_decode((string) $raw, true);

            return is_array($decoded) ? $decoded : [];
        }

        public static function optionLabel(array $options, string $fallback = ''): string
        {
            $values = array_values($options);

            return $values === [] ? $fallback : implode(' / ', $values);
        }

        public static function optionSignature(array $options, string $name = ''): string
        {
            if ($options !== []) {
                $parts = [];
                foreach ($options as $axis => $value) {
                    $parts[] = strtolower((string) $axis) . '=' . strtolower((string) $value);
                }
                sort($parts, SORT_STRING);

                return implode('|', $parts);
            }

            return 'name=' . strtolower(trim($name));
        }

        public static function optionAxes($variations): array
        {
            $axes = [];

            foreach ($variations as $variation) {
                $raw = is_array($variation)
                    ? ($variation['prodvar_options'] ?? null)
                    : ($variation->prodvar_options ?? null);

                foreach (array_keys(self::decodeOptions($raw)) as $axis) {
                    if (! in_array($axis, $axes, true)) {
                        $axes[] = $axis;
                    }
                }
            }

            return $axes;
        }

        public static function optionAxisNamed(array $axes, array $keys): ?string
        {
            foreach ($axes as $axis) {
                if (in_array(strtolower((string) $axis), $keys, true)) {
                    return (string) $axis;
                }
            }

            return null;
        }

        public static function colorSwatches($vars, array $axes): ?array
        {
            $axis = self::optionAxisNamed($axes, self::colorKeys);

            if ($axis === null) {
                if ($axes !== []) {
                    return $vars
                        ->map(fn (Prodvar $v) => [
                            'name'    => (string) $v->prodvar_name,
                            'value'   => '#FF6A00',
                            'image'   => $v->prodvar_pic,
                            'gallery' => $v->prodvar_pic ? [$v->prodvar_pic] : [],
                        ])
                        ->values()
                        ->all();
                }

                $pictured = $vars->filter(fn (Prodvar $v) => filled($v->prodvar_pic));

                return $pictured->isEmpty() ? null : $pictured
                    ->map(fn (Prodvar $v) => [
                        'name'    => $v->prodvar_name,
                        'value'   => '#FF6A00',
                        'image'   => $v->prodvar_pic,
                        'gallery' => [$v->prodvar_pic],
                    ])
                    ->values()
                    ->all();
            }

            $swatches = [];
            foreach ($vars as $variation) {
                $name = (string) (self::decodeOptions($variation->prodvar_options)[$axis] ?? '');
                if ($name === '' || isset($swatches[$name])) {
                    continue;
                }
                $gallery = $vars
                    ->filter(fn (Prodvar $v) => (string) (self::decodeOptions($v->prodvar_options)[$axis] ?? '') === $name)
                    ->pluck('prodvar_pic')
                    ->filter()
                    ->unique()
                    ->values()
                    ->all();

                $swatches[$name] = [
                    'name'    => $name,
                    'value'   => '#FF6A00',
                    'image'   => $gallery[0] ?? $variation->prodvar_pic,
                    'gallery' => $gallery,
                ];
            }

            return $swatches === [] ? null : array_values($swatches);
        }

        public function addProduct(Request $json)
        {
            $validator = (new DatabaseAPI())->addProduct($json);
            if ($validator) return $validator;

            $name = trim((string) $json->input('prod_name', ''));
            if ($name === '') {
                return response()->json(['success' => false, 'message' => 'Product name is required.'], 400);
            }

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

            $categError = null;
            $categ = self::validatedCategory($json->input('prod_categ'), $categError);
            if ($categ === null) {
                return response()->json(['success' => false, 'message' => $categError], 422);
            }

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
                        'prod_id'       => $this->nextId('product', 'prod_id'),
                        'prod_name'     => $name,
                        'prod_tag'      => $tag,
                        'prod_categ'    => $categ,
                        'prod_price'    => $price,
                        'prod_desc'     => $json->input('prod_desc'),
                        'prod_rating'   => 0,
                        'prod_reviews'  => 0,
                        'prod_total_var' => count($variations),
                        'prod_created'  => now(),
                        'prod_disabled' => null,
                        'prod_deleted'  => null,
                    ]);

                    foreach ($variations as $variation) {
                        Prodvar::create($variation + [
                            'prodvar_id'      => $this->nextId('prodvar', 'prodvar_id'),
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
                $variationCount = (int) Prodvar::where('prod_id', $product->prod_id)->count();

                if ($totalStock <= $threshold && $variationCount <= 1) {
                    $this->notifyEmployeesByType(
                        ['ADMIN', 'SUPER ADMIN'],
                        '[PRIORITY] Low stock: "' . $product->prod_name . '" is now down to ' . $totalStock . ' unit(s).'
                    );
                }

                if ($variationCount > 1) {
                    $this->notifyLowStockVariations($product->fresh(), null);
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
                    ->groupBy('prodvar.prod_id', DB::raw('DATE(prodsales.prodsales_date)'))
                    ->orderBy('day')
                    ->get();

                $byProduct = [];
                foreach ($rows as $row) {
                    $pid = (int) $row->pid;
                    $byProduct[$pid] ??= [
                        'prod_id'   => $pid,
                        'prod_name' => null,
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

                if ($byProduct !== []) {
                    $names = Product::whereIn('prod_id', array_keys($byProduct))->pluck('prod_name', 'prod_id');
                    foreach ($byProduct as $pid => $entry) {
                        $byProduct[$pid]['prod_name'] = $names[(int) $pid] ?? null;
                    }
                }

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
                    $status = 'active';
                }

                if ($status === 'disabled') {
                    $query->whereNotNull('prod_disabled')->whereNull('prod_deleted');
                } elseif ($status === 'deleted') {
                    $query->whereNotNull('prod_deleted');
                } elseif ($status === 'active' || !$status) {
                    $query->whereNull('prod_disabled')->whereNull('prod_deleted');
                }

                $products = $query->orderBy('prod_name')->get();
                $rows = self::presentMany($products);
                if ($categ) {
                    $wantedCategory = self::normalizeCategory($categ);
                    $rows = array_values(array_filter(
                        $rows,
                        fn ($row) => self::normalizeCategory(
                            (string) ($row['prod_categ'] ?? ''),
                            (string) ($row['prod_name'] ?? '')
                        ) === $wantedCategory
                    ));
                }

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

        public function productCategories(Request $json)
        {
            try {
                $inUse = Product::whereNull('prod_deleted')
                    ->get(['prod_name', 'prod_categ'])
                    ->map(fn (Product $product) => self::normalizeCategory(
                        (string) $product->prod_categ,
                        (string) $product->prod_name
                    ))
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

        public function searchProducts(Request $json)
        {
            try {
                $q = $json->input('q');
                $query = Product::query();
                if (! $this->isEmployee($json->user('api'))) {
                    $query->whereNull('prod_disabled')->whereNull('prod_deleted');
                }

                if ($q) {
                    $op = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
                    $query->where(function($query) use ($q, $op) {
                        $query->where('prod_name', $op, "%{$q}%")
                              ->orWhere('prod_tag', $op, "%{$q}%")
                              ->orWhere('prod_desc', $op, "%{$q}%");
                    });
                }

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

                $stockBefore = Prodvar::where('prod_id', $product->prod_id)
                    ->whereNull('prodvar_deleted')
                    ->pluck('prodvar_stock', 'prodvar_id')
                    ->map(fn ($stock) => (int) $stock)
                    ->all();

                $stockChanged = false;
                $variantNote = null;
                if ($json->has('prodvar_id') && $json->has('prod_qty')) {
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

                if ($json->has('variant')) {
                    $variantInput = $json->input('variant');
                    if (! is_array($variantInput)) {
                        return response()->json(['success' => false, 'message' => 'The variant details are not valid.'], 422);
                    }
                    $applied = $this->applyVariant($product, $variantInput);
                    if ($applied instanceof \Illuminate\Http\JsonResponse) {
                        return $applied;
                    }
                    $stockChanged = true;
                    $variantNote = $applied;
                }

                if ($json->has('variations') || $json->input('prodvar') !== null) {
                    $variations = $this->parseVariations($json);
                    if ($variations instanceof \Illuminate\Http\JsonResponse) {
                        return $variations;
                    }
                    $this->syncVariations($product, $variations);
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

                    if ($product->totalVariationCount() > 1) {
                        $this->notifyLowStockVariations($product, $stockBefore);
                    }
                }

                $changed = array_merge(
                    array_keys($updateData),
                    $stockChanged ? ['prod_qty'] : [],
                    $json->has('variations') || $json->input('prodvar') !== null ? ['variations'] : [],
                    $json->has('variant') ? ['variant'] : [],
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
                    'message' => $variantNote
                        ?? 'Product details updated successfully',
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
                        'message' => 'Please provide a product identifier or barcode tag'
                    ], 400);
                }

                $product = $query->first();

                if (!$product) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product not found'
                    ], 404);
                }

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

        protected function logInventory(Request $json, string $access, string $what): void
        {
            $user = $json->user('api');
            if ($user instanceof \App\Models\Employee) {
                $this->logEmployee((int) $user->emp_id, $access, $what);
            }
        }

        protected function parseVariations(Request $json)
        {
            $raw = $json->input('variations') ?? $json->input('prodvar') ?? $json->input('vars');

            if ($raw !== null && ! is_array($raw)) {
                return response()->json(['success' => false, 'message' => 'The variations list is not valid.'], 422);
            }

            $rows = [];
            foreach ((array) $raw as $index => $row) {
                if (! is_array($row)) {
                    return response()->json(['success' => false, 'message' => 'One of the variations is not valid.'], 422);
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

                [$options, $optionError] = self::variationOptions(
                    $row['prodvar_options'] ?? $row['options'] ?? null
                );
                if ($optionError !== null) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Variation ' . ($index + 1) . ': ' . $optionError,
                    ], 422);
                }

                $name = trim((string) ($row['prodvar_name'] ?? $row['name'] ?? ''));
                if ($name === '') {
                    $name = self::optionLabel($options, 'Variation ' . ($index + 1));
                }

                $rows[] = [
                    'prodvar_name'     => $name,
                    'prodvar_pic'      => filled($pic) ? $pic : null,
                    'prodvar_stock'    => (int) $stock,
                    'prodvar_main'     => (bool) ($row['prodvar_main'] ?? $row['main'] ?? false),
                    'prodvar_markup'   => ($markup === null || $markup === '') ? 0.0 : round((float) $markup, 2),
                    'prodvar_options'  => self::encodeOptions($options),
                    'prodvar_preorder' => (bool) ($row['prodvar_preorder'] ?? $row['preorder'] ?? false),
                ];
            }

            if (count($rows) > self::maxVariations) {
                return response()->json([
                    'success' => false,
                    'message' => 'A product can have at most ' . self::maxVariations . ' variations.',
                ], 422);
            }

            $seen = [];
            foreach ($rows as $index => $row) {
                $signature = self::optionSignature(
                    self::decodeOptions($row['prodvar_options']),
                    (string) $row['prodvar_name']
                );

                if (isset($seen[$signature])) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Variation ' . ($index + 1) . ' ("' . $row['prodvar_name'] . '"'
                            . ') is the same combination as variation ' . ($seen[$signature] + 1)
                            . '. Send one row per combination so its stock stays on one line.',
                    ], 409);
                }

                $seen[$signature] = $index;
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

        protected function applyMainImage(Product $product, string $image): void
        {
            $main = Prodvar::where('prod_id', $product->prod_id)
                ->whereNull('prodvar_deleted')
                ->orderByRaw('prodvar_main desc')
                ->orderBy('prodvar_id')
                ->first();

            $main?->update(['prodvar_pic' => $image]);
        }

        protected function syncVariations(Product $product, array $incoming): void
        {
            $existing = Prodvar::where('prod_id', $product->prod_id)
                ->whereNull('prodvar_deleted')
                ->get();

            $index = [];
            foreach ($existing as $variation) {
                $index[self::optionSignature(
                    self::decodeOptions($variation->prodvar_options),
                    (string) $variation->prodvar_name
                )] = $variation;
            }

            foreach ($incoming as $row) {
                $signature = self::optionSignature(
                    self::decodeOptions($row['prodvar_options']),
                    (string) $row['prodvar_name']
                );

                $attributes = [
                    'prodvar_name'     => $row['prodvar_name'],
                    'prodvar_pic'      => $row['prodvar_pic'],
                    'prodvar_stock'    => $row['prodvar_stock'],
                    'prodvar_main'     => $row['prodvar_main'],
                    'prodvar_markup'   => $row['prodvar_markup'],
                    'prodvar_options'  => $row['prodvar_options'],
                    'prodvar_preorder' => $row['prodvar_preorder'],
                ];

                $match = $index[$signature] ?? null;

                if ($match) {
                    unset($index[$signature]);
                    $match->update($attributes + ['prodvar_disabled' => null]);
                    continue;
                }

                Prodvar::create($attributes + [
                    'prodvar_id'      => $this->nextId('prodvar', 'prodvar_id'),
                    'prod_id'          => $product->prod_id,
                    'prodvar_created'  => now(),
                    'prodvar_disabled' => null,
                    'prodvar_deleted'  => null,
                ]);
            }

            foreach ($index as $variation) {
                $this->retireVariation($product, $variation);
            }
        }

        protected function applyVariant(Product $product, array $input)
        {
            $prodvarId = $input['prodvar_id'] ?? $input['id'] ?? null;
            $remove = (bool) ($input['remove'] ?? $input['delete'] ?? $input['_destroy'] ?? false);

            $existing = null;
            if (filled($prodvarId)) {
                if (! is_numeric($prodvarId)) {
                    return response()->json(['success' => false, 'message' => 'variant.prodvar_id must be a number.'], 422);
                }
                $existing = Prodvar::where('prod_id', $product->prod_id)
                    ->where('prodvar_id', (int) $prodvarId)
                    ->first();
                if (! $existing) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product variation not found for this product.',
                    ], 422);
                }
            }

            if ($remove) {
                if (! $existing) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A variation can only be removed with its prodvar_id.',
                    ], 422);
                }

                return $this->retireVariation($product, $existing);
            }

            $optionsSent = array_key_exists('prodvar_options', $input)
                || array_key_exists('options', $input);
            [$options, $optionError] = self::variationOptions(
                $input['prodvar_options'] ?? $input['options'] ?? null
            );
            if ($optionError !== null) {
                return response()->json(['success' => false, 'message' => $optionError], 422);
            }

            $name = array_key_exists('prodvar_name', $input) || array_key_exists('name', $input)
                ? trim((string) ($input['prodvar_name'] ?? $input['name'] ?? ''))
                : null;
            if ($name === null || $name === '') {
                $name = self::optionLabel(
                    $optionsSent ? $options : self::decodeOptions($existing?->prodvar_options),
                    (string) ($existing->prodvar_name ?? 'Variation')
                );
            }

            $attributes = ['prodvar_name' => $name];

            $stock = $input['prodvar_stock'] ?? $input['stock'] ?? null;
            if ($stock !== null) {
                if (! is_numeric($stock) || (int) $stock < 0) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Variation stock must be a non-negative number.',
                    ], 422);
                }
                $attributes['prodvar_stock'] = (int) $stock;
            }

            $markup = array_key_exists('prodvar_markup', $input) || array_key_exists('markup', $input)
                ? ($input['prodvar_markup'] ?? $input['markup'] ?? 0)
                : null;
            if ($markup !== null) {
                if ($markup !== '' && ! is_numeric($markup)) {
                    return response()->json(['success' => false, 'message' => 'Variation markup must be a number.'], 422);
                }
                $attributes['prodvar_markup'] = ($markup === '' ? 0.0 : round((float) $markup, 2));
            }

            $pic = array_key_exists('prodvar_pic', $input) || array_key_exists('pic', $input)
                ? ($input['prodvar_pic'] ?? $input['pic'] ?? null)
                : null;
            if (filled($pic) && ! self::imageAllowed($pic)) {
                return response()->json(['success' => false, 'message' => 'Images must be JPG or PNG files.'], 422);
            }
            if (filled($pic) && ! self::imageWithinSize($pic)) {
                return response()->json(['success' => false, 'message' => 'Product images must be 2 MB or smaller.'], 422);
            }
            if (array_key_exists('prodvar_pic', $input) || array_key_exists('pic', $input)) {
                $attributes['prodvar_pic'] = filled($pic) ? $pic : null;
            }

            if (array_key_exists('prodvar_preorder', $input)) {
                $attributes['prodvar_preorder'] = (bool) $input['prodvar_preorder'];
            }

            if (array_key_exists('prodvar_disabled', $input)) {
                $attributes['prodvar_disabled'] = filter_var(
                    $input['prodvar_disabled'],
                    FILTER_VALIDATE_BOOLEAN
                ) ? now() : null;
            }

            if (array_key_exists('prodvar_main', $input)) {
                $attributes['prodvar_main'] = (bool) $input['prodvar_main'];
            }

            if ($optionsSent) {
                $attributes['prodvar_options'] = self::encodeOptions($options);
            }

            $resulting = $optionsSent ? $options : self::decodeOptions($existing?->prodvar_options);
            $signature = self::optionSignature($resulting, (string) ($attributes['prodvar_name'] ?? ''));

            $clash = Prodvar::where('prod_id', $product->prod_id)
                ->whereNull('prodvar_deleted')
                ->when($existing, fn ($query) => $query->where('prodvar_id', '!=', $existing->prodvar_id))
                ->get(['prodvar_id', 'prodvar_name', 'prodvar_options'])
                ->first(fn (Prodvar $variation) => self::optionSignature(
                    self::decodeOptions($variation->prodvar_options),
                    (string) $variation->prodvar_name
                ) === $signature);

            if ($clash) {
                return response()->json([
                    'success' => false,
                    'message' => 'Variation "' . $clash->prodvar_name . '" already varates this product'
                        . ' the same way. Edit that row instead of adding a second one.',
                ], 409);
            }

            if ($existing) {
                $existing->update($attributes);
                $note = 'Variation "' . $existing->prodvar_name . '" updated successfully';
            } else {
                $created = Prodvar::create($attributes + [
                    'prodvar_id'      => $this->nextId('prodvar', 'prodvar_id'),
                    'prod_id'          => $product->prod_id,
                    'prodvar_created'  => now(),
                    'prodvar_disabled' => null,
                    'prodvar_deleted'  => null,
                ]);
                $note = 'Variation "' . $created->prodvar_name . '" added to the product';
            }

            if (! empty($attributes['prodvar_main'])) {
                Prodvar::where('prod_id', $product->prod_id)
                    ->whereNull('prodvar_deleted')
                    ->when($existing, fn ($query) => $query->where('prodvar_id', '!=', $existing->prodvar_id))
                    ->update(['prodvar_main' => false]);
            }

            return $note;
        }

        protected function retireVariation(Product $product, Prodvar $variation)
        {
            $live = Prodvar::where('prod_id', $product->prod_id)
                ->whereNull('prodvar_deleted')
                ->count();

            if ($live <= 1) {
                return response()->json([
                    'success' => false,
                    'message' => 'A product needs at least one variation. Edit this one instead of removing it.',
                ], 422);
            }

            $heldInBag = DB::table('bag')
                ->where('prodvar_id', $variation->prodvar_id)
                ->whereNull('bag_deleted')
                ->where('bag_placed', false)
                ->exists();

            if ($heldInBag) {
                $variation->update(['prodvar_disabled' => now()]);

                return 'Variation "' . $variation->prodvar_name . '" is held in a customer bag,'
                    . ' so it was disabled instead of removed.';
            }

            $variation->update([
                'prodvar_disabled' => now(),
                'prodvar_deleted'  => now(),
            ]);

            self::syncTotals($product);

            return 'Variation "' . $variation->prodvar_name . '" removed successfully';
        }

        protected function notifyLowStockVariations(Product $product, ?array $before): void
        {
            $threshold = (int) SystemSettings::get('low_stock_threshold', 5);

            $now = Prodvar::where('prod_id', $product->prod_id)
                ->whereNull('prodvar_deleted')
                ->get(['prodvar_id', 'prodvar_name', 'prodvar_stock', 'prodvar_options']);

            foreach ($now as $variation) {
                $stock = (int) $variation->prodvar_stock;
                $previous = $before[$variation->prodvar_id] ?? null;

                if ($previous !== null && $previous <= $threshold) {
                    continue;
                }
                if ($stock > $threshold) {
                    continue;
                }

                $label = self::optionLabel(
                    self::decodeOptions($variation->prodvar_options),
                    (string) $variation->prodvar_name
                );

                $this->notifyEmployeesByType(
                    ['ADMIN', 'SUPER ADMIN'],
                    '[PRIORITY] Low stock: "' . $product->prod_name . '" (' . $label . ')'
                        . ' is now down to ' . $stock . ' unit(s).'
                );
            }
        }

        protected static function syncTotals(Product $product): void
        {
            $product->update([
                'prod_total_var' => Prodvar::where('prod_id', $product->prod_id)
                    ->whereNull('prodvar_deleted')
                    ->count(),
            ]);
        }

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

        protected static function salesForProducts(array $prodIds): array
        {
            $prodIds = array_values(array_unique(array_filter(
                array_map('intval', $prodIds),
                fn ($id) => $id > 0
            )));

            if ($prodIds === []) {
                return [];
            }

            $rows = DB::table('prodsales')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'prodsales.prodvar_id')
                ->whereIn('prodvar.prod_id', $prodIds)
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

        protected const notPurchased = ['processing', 'to cancel', 'cancelled'];

        protected function countsAsPurchase($status): bool
        {
            return ! in_array($this->purchaseStatusKey($status), self::notPurchased, true);
        }

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

        protected function reviewsPresent(Review $review, ?int $ordId = null): array
        {
            $decoded = $this->decode($review->rev_msg);
            $status = $review->rev_approved !== null
                ? 'approved'
                : ($decoded['rejected'] ? 'rejected' : 'pending');

            $legacyText = $status === 'rejected' ? '[REVIEW CENSORED]' : $decoded['text'];

            $product  = $review->product;
            $customer = $review->customer;

            return [
                'rev_id'       => (int) $review->rev_id,
                'cust_id'      => (int) $review->cust_id,
                'prod_id'      => (int) $review->prod_id,
                'rev_created'  => optional($review->rev_created)->toDateTimeString(),
                'rev_approved' => optional($review->rev_approved)->toDateTimeString(),

                'prod_name'    => $product?->prod_name,
                'cust_name'    => $customer
                    ? trim(($customer->cust_nickname ?: $customer->cust_givname) . ' ' . $customer->cust_surname)
                    : null,
                'rating'       => $decoded['rating'],
                'message'      => $decoded['text'],
                'status'       => $status,

                'ord_id'       => $ordId,
                'ord_rating'   => $decoded['rating'],
                'ord_review'   => $legacyText,
                'ord_completed' => optional($review->rev_created)->toDateTimeString(),
            ];
        }

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

        protected function orderIdFor(Review $review, array $map): ?int
        {
            return $map[(int) $review->cust_id][(int) $review->prod_id] ?? null;
        }

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

        protected function isDeleted(Review $review): bool
        {
            return str_starts_with((string) $review->rev_msg, '[DELETED]');
        }

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
                        $resolvedProd = is_numeric($prodId) ? Product::find($prodId) : Product::where('prod_tag', $prodId)->first();
                        $resolvedProdId = $resolvedProd ? (int) $resolvedProd->prod_id : (int) $prodId;
                        if (! in_array($resolvedProdId, $orderProducts, true)) {
                            return response()->json([
                                'success' => false,
                                'message' => 'The requested product is not part of this order',
                            ], 403);
                        }
                        $prodId = $resolvedProdId;
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
                    $product = is_numeric($prodId) ? Product::find($prodId) : Product::where('prod_tag', $prodId)->first();
                    if (! $product) {
                        return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                    }
                    $prodId = (int) $product->prod_id;

                    $placeholders = implode(',', array_fill(0, count(self::notPurchased), '?'));
                    $purchased = DB::table('orders')
                        ->join('items', 'items.ord_id', '=', 'orders.ord_id')
                        ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                        ->join('prodvar', 'prodvar.prodvar_id', '=', 'bag.prodvar_id')
                        ->where('orders.cust_id', $customer->getKey())
                        ->where('prodvar.prod_id', $prodId)
                        ->whereRaw('LOWER(orders.ord_status) NOT IN (' . $placeholders . ')', self::notPurchased)
                        ->exists();

                    if (! $purchased) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased',
                        ], 403);
                    }

                    $prodId = (int) $prodId;
                }

                $existing = Review::where('cust_id', $customer->getKey())
                    ->where('prod_id', $prodId)
                    ->orderByDesc('rev_created')
                    ->first();

                if ($existing && ! $existing->isRejected() && ! $this->isDeleted($existing)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You have already reviewed this product. Please edit your existing review instead.',
                    ], 409);
                }

                $review = DB::transaction(function () use ($customer, $prodId, $rating, $text) {
                    // reviews.rev_id carries no DB default/identity; allocate it here
                    // (schema must stay untouched), serialised to avoid duplicate ids.
                    if (DB::connection()->getDriverName() === 'pgsql') {
                        DB::select('select pg_advisory_xact_lock(?)', [730013]);
                    }
                    $nextId = $this->nextId('reviews', 'rev_id');

                    $row = new Review([
                        'cust_id'      => $customer->getKey(),
                        'prod_id'      => $prodId,
                        'rev_msg'      => Review::compose($rating, $text),
                        'rev_created'  => now(),
                        'rev_approved' => null,
                    ]);
                    $row->rev_id = $nextId;
                    $row->save();

                    return $row;
                });

                $this->logCustomer((int) $customer->getKey(), 'edit',
                    'POST /api/reviews/create - review #' . $review->rev_id . ' (product #' . $prodId . ')');

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

        public function deleteReview(Request $json)
        {
            $validator = (new DatabaseAPI())->deleteReview($json);
            if ($validator) return $validator;

            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review;
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

                $review->rev_msg = '[DELETED] ' . (string) $review->rev_msg;
                $review->rev_approved = null;
                $review->save();
                $this->recomputeProduct($prodId);

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

                $query->whereRaw("rev_msg NOT LIKE '[DELETED]%'");

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
                    $query->whereNotNull('rev_approved');
                }

                $needle = $q !== '' ? $q : trim((string) $json->input('search', ''));
                if ($needle !== '') {
                    $query->where(function ($builder) use ($needle) {
                        $builder->whereHas('product', function ($pq) use ($needle) {
                            $pq->where('prod_name', 'like', "%{$needle}%")
                               ->orWhere('prod_tag', 'like', "%{$needle}%");
                        })->orWhereHas('customer', function ($cq) use ($needle) {
                            // The live `customer` table carries no
                            // `cust_nickname` column (spec section 6: the
                            // nickname is the derived full-name alias the shared
                            // response re-exports), so filtering on it failed on
                            // Postgres. Name matches use the stored name columns.
                            $cq->where('cust_email', 'like', "%{$needle}%")
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

        public function moderateReview(Request $json)
        {
            $validator = (new DatabaseAPI())->moderateReview($json);
            if ($validator) return $validator;

            $denied = $this->requireEmployee($json);
            if ($denied) return $denied;

            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review;
                }
                if (! $review) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                if ($this->isDeleted($review)) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                $approve = $json->boolean('approve', true);
                $decoded = $this->decode($review->rev_msg);
                $censored = $json->input('censored_review');
                $text = $censored !== null ? (string) $censored : $decoded['text'];
                $rating = $decoded['rating'] > 0 ? $decoded['rating'] : 1;

                if ($approve) {
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

        public function scoreRating(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = Review::whereNotNull('rev_approved')
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

        public function updateReview(Request $json)
        {
            $validator = (new DatabaseAPI())->updateReview($json);
            if ($validator) return $validator;

            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review;
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
                $review->rev_approved = null;
                $review->save();

                $this->logCustomer((int) $user->getKey(), 'edit',
                    'PUT /api/reviews/update - review #' . $review->rev_id . ' (product #' . $review->prod_id . ')');

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

    private const imageRules = ['required', 'image', 'mimes:png,jpg,jpeg,gif,webp', 'max:2048'];

    public static function publicUrl(string $path): string
    {
        $origin = rtrim((string) config('app.url'), '/');
        $request = app('request');

        if ($request instanceof Request && $request->getHost() !== '') {
            $origin = rtrim($request->getSchemeAndHttpHost(), '/');
        }

        return $origin . '/' . ltrim($path, '/');
    }

    public function uploadImage(Request $request)
    {
        $validator = Validator::make($request->all(), ['file' => self::imageRules]);

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
                        'url'     => self::publicUrl('storage/' . $path),
                        'path'    => $path,
                        'storage' => 'public',
                    ],
                ], 200);
            }

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
