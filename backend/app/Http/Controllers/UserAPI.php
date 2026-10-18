<?php

namespace App\Http\Controllers;

use App\Http\Controllers\ProductsAPI;
use App\Models\Bag;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\EmpLog;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Item;
use App\Models\Order;
use App\Models\Product;
use App\Models\Prodvar;
use App\Models\Schedule;
use App\Models\Wishlist;
use App\Support\ApiToken;
use App\Support\EmployeePassword;
use App\Support\IdAllocator;
use App\Support\SystemSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class UserAPI extends Controller
{

    private static ?array $counterColumns = null;

    public function addOrder(Request $json)
    {
        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }
            if ($json->filled('cust_id') && (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $validator = (new DatabaseAPI())->addOrder($json);
            if ($validator) return $validator;

            $customer = Customer::find($custId);
            if (! $customer) {
                return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
            }

            $lines = [];
            if ($json->has('items') && is_array($json->input('items'))) {
                $lines = $json->input('items');
            } elseif ($json->filled('prod_id')) {
                $lines[] = [
                    'prod_id'     => $json->input('prod_id'),
                    'prodvar_id'  => $json->input('prodvar_id'),
                    'size'        => $json->input('size'),
                    'color'       => $json->input('color'),
                    'options'     => $json->input('options'),
                    'item_qty'    => $json->input('item_qty', 1),
                    'item_amount' => $json->input('item_amount'),
                ];
            } else {
                return response()->json([
                    'success' => false,
                    'message' => 'Add at least one product to continue.',
                ], 400);
            }

            if (count($lines) === 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'No products provided.',
                ], 400);
            }

            foreach ($lines as $line) {
                $line    = (array) $line;
                $prodKey = $line['prod_id'] ?? null;
                if ($prodKey === null || $prodKey === '') continue;

                $product = $this->resolveProduct($prodKey);
                if (! $product || ! $product->isBuyable()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product "' . ($product?->prod_name ?? $prodKey) . '" is not available.',
                    ], 400);
                }

                $prodvar = self::resolveVariation(
                    $product,
                    $line['prodvar_id'] ?? null,
                    $line['size'] ?? null,
                    $line['color'] ?? null,
                    $line['options'] ?? null
                );
                if (! $prodvar) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                    ], 400);
                }

                $qty  = max(1, (int) ($line['item_qty'] ?? $line['bag_qty'] ?? 1));
                $unit = $this->unitAmount($line['item_amount'] ?? null, $product, $prodvar);

                self::upsertBagLine($custId, $prodvar, $qty, $unit);
            }

            self::syncCartCounter($custId);
            $this->logCustomer($custId, 'edit', 'POST /api/cart/add');

            return response()->json([
                'success' => true,
                'message' => 'Added to cart successfully',
                'data'    => self::cartEnvelope($custId),
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add to cart',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function displayOrders(Request $json)
    {
        try {
            $scope = $this->orderScope($json);
            if ($scope === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }
            $custId = $scope['custId'];
            $employeeView = $scope['employee'];

            $this->logView($json, 'cart');

            if (!$employeeView && $this->wantsBagRows($json)) {
                self::syncCartCounter($custId);

                return response()->json([
                    'success' => true,
                    'message' => 'Cart retrieved successfully',
                    'data'    => self::cartEnvelope($custId),
                ], 200);
            }

            $query = $this->ordersQuery($custId);

            if ($json->filled('ord_status')) {
                $query->where('ord_status', $json->input('ord_status'));
            } elseif ($json->filled('status')) {
                $query->where('ord_status', $json->input('status'));
            }
            if ($json->filled('ord_id')) {
                $query->where('ord_id', $json->input('ord_id'));
            }
            if ($json->filled('filter')) {
                $this->applyOrderFilter($query, (string) $json->input('filter'));
            }

            $orders = $query->orderByDesc('ord_created')->get();

            return response()->json([
                'success'    => true,
                'message'    => 'Orders retrieved successfully',
                'data'       => $this->ordersPayload($orders),
                'cart_count' => $this->orderScopeCartCount($custId),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to display orders',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function searchOrders(Request $json)
    {
        try {
            $scope = $this->orderScope($json);
            if ($scope === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }
            $custId = $scope['custId'];
            $employeeView = $scope['employee'];

            $q = trim((string) $json->input('q', ''));

            if (!$employeeView && $this->wantsBagRows($json)) {
                $bags = self::bagQuery($custId);
                if ($q !== '') {
                    $bags->whereHas('prodvar.product', function ($pq) use ($q) {
                        $pq->where('prod_name', 'like', "%{$q}%")
                           ->orWhere('prod_tag', 'like', "%{$q}%");
                    });
                }
                $bags = $bags->orderByDesc('bag_created')->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Cart search completed',
                    'data'    => [
                        'items'       => self::cartItemsPayload($bags),
                        'cart_count'  => $bags->count(),
                        'subtotal'    => round((float) $bags->sum(fn (Bag $b) => (float) $b->bag_amount * (int) $b->bag_qty), 2),
                    ],
                ], 200);
            }

            $query = $this->ordersQuery($custId);

            if ($q !== '') {
                $query->where(function ($builder) use ($q) {
                    $builder->where('ord_status', 'like', "%{$q}%")
                            ->orWhereHas('items.bag.prodvar.product', function ($pq) use ($q) {
                                $pq->where('prod_name', 'like', "%{$q}%")
                                   ->orWhere('prod_tag', 'like', "%{$q}%");
                            });

                    if (ctype_digit($q)) {
                        $builder->orWhere('ord_id', (int) $q);
                    }
                });
            }
            if ($json->filled('filter')) {
                $this->applyOrderFilter($query, (string) $json->input('filter'));
            }

            return response()->json([
                'success'    => true,
                'message'    => 'Orders search completed',
                'data'       => $this->ordersPayload($query->orderByDesc('ord_created')->get()),
                'cart_count' => $this->orderScopeCartCount($custId),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to search orders',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function sortOrders(Request $json)
    {
        try {
            $scope = $this->orderScope($json);
            if ($scope === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }
            $custId = $scope['custId'];
            $employeeView = $scope['employee'];

            $sortBy   = $json->input('sort_by', 'date');
            $orderDir = strtolower($json->input('order', 'desc')) === 'asc' ? 'asc' : 'desc';

            $columnMap = [
                'date'   => 'ord_created',
                'status' => 'ord_status',
                'id'     => 'ord_id',
                'amount' => 'ord_amount',
                'total'  => 'ord_amount',
                'rating' => 'ord_created',
            ];
            $column = $columnMap[$sortBy] ?? 'ord_created';

            if (!$employeeView && $this->wantsBagRows($json)) {
                $bags = self::bagQuery($custId)->orderByDesc('bag_created')->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Cart sorted successfully',
                    'data'    => [
                        'items'      => self::cartItemsPayload($bags),
                        'cart_count' => $bags->count(),
                        'subtotal'   => round((float) $bags->sum(fn (Bag $b) => (float) $b->bag_amount * (int) $b->bag_qty), 2),
                    ],
                ], 200);
            }

            $query = $this->ordersQuery($custId);
            if ($json->filled('filter')) {
                $this->applyOrderFilter($query, (string) $json->input('filter'));
            }

            $orders = $query->orderBy($column, $orderDir)->get();

            return response()->json([
                'success'    => true,
                'message'    => 'Orders sorted successfully',
                'data'       => $this->ordersPayload($orders),
                'cart_count' => $this->orderScopeCartCount($custId),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to sort orders',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function removeOrder(Request $json)
    {
        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $validator = (new DatabaseAPI())->removeOrder($json);
            if ($validator) return $validator;

            $bagId = $json->input('bag_id') ?? $json->input('item_id') ?? $json->input('ord_id');
            if ($bagId === null || $bagId === '') {
                return response()->json([
                    'success' => false,
                    'message' => 'Cart item ID is required.',
                ], 400);
            }

            $bag = Bag::where('bag_id', $bagId)
                ->where('cust_id', $custId)
                ->whereNull('bag_deleted')
                ->first();

            if (! $bag) {
                return response()->json(['success' => false, 'message' => 'Cart item not found'], 404);
            }

            if ($bag->bag_placed) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only cart items can be removed.',
                ], 409);
            }

            $bag->update([
                'bag_deleted' => now(),
                'bag_placed'  => DB::raw('false'),
            ]);

            self::syncCartCounter($custId);
            $this->logCustomer($custId, 'edit', 'DELETE /api/cart/remove');

            return response()->json([
                'success' => true,
                'message' => 'Removed from cart successfully',
                'data'    => self::cartEnvelope($custId),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove from cart',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function updateBagLine(Request $json)
    {
        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $bagId = $json->input('bag_id') ?? $json->input('item_id');
            if ($bagId === null || $bagId === '') {
                return response()->json([
                    'success' => false,
                    'message' => 'Cart item ID is required.',
                ], 400);
            }
            if (! $json->has('item_qty')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Item quantity is required.',
                ], 400);
            }

            $qty = (int) $json->input('item_qty');
            if ($qty < 1) {
                return response()->json([
                    'success' => false,
                    'message' => 'item_qty must be at least 1.',
                ], 400);
            }

            $bag = self::bagQuery($custId)->where('bag_id', $bagId)->first();
            if (! $bag) {
                return response()->json(['success' => false, 'message' => 'Cart item not found'], 404);
            }

            if ($bag->prodvar) {
                $qty = max(1, min($qty, (int) $bag->prodvar->prodvar_stock));
            }

            $bag->update(['bag_qty' => $qty]);

            self::syncCartCounter($custId);
            $this->logCustomer($custId, 'edit', 'POST /api/orders/add');

            return response()->json([
                'success' => true,
                'message' => 'Cart quantity updated successfully',
                'data'    => self::cartEnvelope($custId),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update cart quantity',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function clearCart(Request $json)
    {
        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            Bag::where('cust_id', $custId)
                ->whereNull('bag_deleted')
                ->whereRaw('bag_placed = false')
                ->update(['bag_deleted' => now()]);

            self::syncCartCounter($custId);
            $this->logCustomer($custId, 'edit', 'POST /api/cart/clear');

            return response()->json([
                'success' => true,
                'message' => 'Cart cleared successfully',
                'data'    => [
                    'items'      => [],
                    'cart_count' => 0,
                    'subtotal'   => 0.0,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to clear cart',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public static function cartItemPayload(Bag $bag): array
    {
        $bag->loadMissing(['prodvar.product']);
        $prodvar = $bag->prodvar;
        $product = $prodvar ? $prodvar->product : null;
        $present = $product ? ProductsAPI::present($product) : null;
        $pic     = $prodvar ? $prodvar->prodvar_pic : null;
        $picUrl  = filled($pic) ? ProductsAPI::publicPicture($pic) : null;
        $unit    = $product
            ? round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2)
            : round((float) $bag->bag_amount, 2);

        $qty      = (int) $bag->bag_qty;
        $amount   = round((float) $bag->bag_amount, 2);
        $lineTotal = round($qty * $amount, 2);

        return [
            'id'             => 'bag-' . $bag->bag_id,
            'bag_id_display' => 'bag-' . $bag->bag_id,
            'bag_id'         => (int) $bag->bag_id,
            'cust_id'        => (int) $bag->cust_id,
            'prodvar_id'     => (int) $bag->prodvar_id,
            'bag_qty'        => $qty,
            'bag_amount'     => $amount,
            'bag_placed'     => (bool) $bag->bag_placed,
            'bag_created'    => $bag->bag_created,
            'bag_deleted'    => $bag->bag_deleted,
            'qty'            => $qty,
            'amount'         => $amount,
            'line_total'     => $lineTotal,
            'prodvar'        => $prodvar ? $prodvar->toArray() : null,
            'item_id'        => (int) $bag->bag_id,
            'item_qty'       => $qty,
            'item_amount'    => $lineTotal,
            'prod_id'       => $product ? $product->prod_id : null,
            'prod_tag'      => $product ? $product->prod_tag : null,
            'prod_name'     => $product ? $product->prod_name : null,
            'prodvar_name'  => $prodvar ? $prodvar->prodvar_name : null,
            'prodvar_pic'   => $picUrl,
            'prodvar_stock' => (int) ($prodvar ? $prodvar->prodvar_stock : 0),
            'unit_price'    => $unit,
            'size'          => $prodvar ? $prodvar->prodvar_name : null,
            'color'         => filled($picUrl) && $prodvar
                ? ['name' => $prodvar->prodvar_name, 'image' => $picUrl, 'gallery' => [$picUrl]]
                : null,
            'product'       => $present,
            'available'     => $present ? (bool) $present['available'] : false,
        ];
    }

    public static function cartItemsPayload($bags): array
    {
        $bags = collect($bags)->values();
        self::primeCartProducts($bags);

        return $bags->map(fn (Bag $bag) => self::cartItemPayload($bag))->values()->all();
    }

    public static function primeCartProducts($bags): void
    {
        $products = [];
        foreach (collect($bags) as $bag) {
            if (! $bag instanceof Bag) {
                continue;
            }
            $bag->loadMissing('prodvar.product');
            $product = $bag->prodvar?->product;
            if ($product !== null) {
                $products[] = $product;
            }
        }
        ProductsAPI::primePresentations($products);
    }

    public static function cartEnvelope(int $custId): array
    {
        $bags = self::bagQuery($custId)->orderByDesc('bag_created')->get();

        return [
            'items'      => self::cartItemsPayload($bags),
            'cart_count' => $bags->count(),
            'subtotal'   => round((float) $bags->sum(
                fn (Bag $bag) => (float) $bag->bag_amount * (int) $bag->bag_qty
            ), 2),
        ];
    }

    public static function bagQuery(int $custId)
    {
        return Bag::with(['prodvar.product'])
            ->where('cust_id', $custId)
            ->whereNull('bag_deleted')
            ->whereRaw('bag_placed = false');
    }

    public static function cartCount(int $custId): int
    {
        return self::bagQuery($custId)->count();
    }

    public static function resolveVariation(Product $product, $prodvarId = null, $size = null, $color = null, $options = null): ?Prodvar
    {
        $vars = Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->whereNull('prodvar_disabled')
            ->orderByDesc('prodvar_main')
            ->orderBy('prodvar_id')
            ->get();

        if ($vars->isEmpty()) {
            return null;
        }

        if ($prodvarId !== null && $prodvarId !== '') {
            $explicit = $vars->first(fn (Prodvar $v) => (int) $v->prodvar_id === (int) $prodvarId);
            if ($explicit) {
                return $explicit;
            }
        }

        $sizeLabel = is_scalar($size) ? trim((string) $size) : '';
        $colorName = is_array($color) ? ($color['name'] ?? null) : $color;
        $colorName = is_scalar($colorName) ? trim((string) $colorName) : '';
        $colorImage = is_array($color)
            ? ($color['image'] ?? ($color['gallery'][0] ?? null))
            : null;

        if (is_array($options) && $options !== []) {
            $wanted = ProductsAPI::normalizeOptions($options);
            if ($wanted !== null) {
                $signature = ProductsAPI::optionSignature($wanted);

                return $vars->first(function (Prodvar $var) use ($signature) {
                    return ProductsAPI::optionSignature(
                        ProductsAPI::decodeOptions($var->prodvar_options),
                        (string) $var->prodvar_name
                    ) === $signature;
                }) ?? $vars->first();
            }
        }

        if ($sizeLabel === '' && $colorName === '') {
            return $vars->first();
        }

        $best = null;
        $bestScore = 0;

        foreach ($vars as $var) {
            $name = trim((string) $var->prodvar_name);
            $opts = self::variationOptions($var);
            $values = array_map(
                fn ($value) => strtolower(trim((string) $value)),
                array_values($opts)
            );
            $axes = array_map('strtolower', array_keys($opts));

            $score = 0;

            if ($sizeLabel !== '') {
                if (strcasecmp($name, $sizeLabel) === 0) $score += 3;
                $optionSize = $opts['size'] ?? $opts['sizes'] ?? null;
                foreach (is_array($optionSize) ? $optionSize : [$optionSize] as $candidate) {
                    if ($candidate !== null && strcasecmp(trim((string) $candidate), $sizeLabel) === 0) {
                        $score += 4;
                        break;
                    }
                }
                if (in_array(strtolower($sizeLabel), $values, true)) {
                    $score += 4;
                }
            }

            if ($colorName !== '') {
                if (strcasecmp($name, $colorName) === 0) $score += 3;
                $optionColor = $opts['color'] ?? $opts['colour'] ?? null;
                if ($optionColor !== null && strcasecmp(trim((string) $optionColor), $colorName) === 0) {
                    $score += 4;
                }
                if (in_array(strtolower($colorName), $values, true)) {
                    $score += 4;
                }
            }

            if ($colorImage !== null && filled($var->prodvar_pic)
                && trim((string) $var->prodvar_pic) === trim((string) $colorImage)) {
                $score += 2;
            }

            $matchedAxes = 0;
            foreach ($axes as $index => $axis) {
                $value = $values[$index];
                if (($sizeLabel !== '' && $value === strtolower($sizeLabel))
                    || ($colorName !== '' && $value === strtolower($colorName))) {
                    $matchedAxes++;
                }
            }
            if ($matchedAxes > 0 && $matchedAxes === max(
                1,
                count(array_filter([$sizeLabel !== '', $colorName !== '']))
            )) {
                $score += 10;
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $var;
            }
        }

        return $best ?? $vars->first();
    }

    public static function upsertBagLine(int $custId, Prodvar $prodvar, int $qty, ?float $unitAmount): Bag
    {
        $unit = $unitAmount !== null
            ? round($unitAmount, 2)
            : round((float) $prodvar->product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2);

        $bag = self::bagQuery($custId)
            ->where('prodvar_id', $prodvar->prodvar_id)
            ->orderByDesc('bag_created')
            ->first();

        if ($bag) {
            $bag->update([
                'bag_qty'    => (int) $bag->bag_qty + max(1, $qty),
                'bag_amount' => $unit,
            ]);

            return $bag;
        }

        return Bag::create([
            'bag_id'     => IdAllocator::next('bag', 'bag_id'),
            'cust_id'     => $custId,
            'prodvar_id'  => $prodvar->prodvar_id,
            'bag_qty'     => max(1, $qty),
            'bag_amount'  => $unit,
            'bag_placed'  => DB::raw('false'),
            'bag_created' => now(),
            'bag_deleted' => null,
        ]);
    }

    public static function syncCartCounter(int $custId): void
    {
        $count = self::cartCount($custId);

        $columns = self::counterColumns();
        if ($columns) {
            Customer::where('cust_id', $custId)->update(array_fill_keys($columns, $count));
        }
    }

    private static function counterColumns(): array
    {
        if (self::$counterColumns === null) {
            self::$counterColumns = array_values(array_filter(
                ['cust_bag', 'cust_cart'],
                fn (string $column) => Schema::hasColumn('customer', $column)
            ));
        }

        return self::$counterColumns;
    }

    private static function variationOptions(Prodvar $prodvar): array
    {
        $raw = $prodvar->prodvar_options;
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);

            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }

    private function unitAmount($sent, Product $product, Prodvar $prodvar): float
    {
        if ($sent !== null && $sent !== '') {
            return round((float) $sent, 2);
        }

        return round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2);
    }

    protected function orderScope(Request $json): ?array
    {
        $custId = $this->customerId($json);
        if ($custId !== null) {
            return ['custId' => $custId, 'employee' => false];
        }
        if ($this->isEmployee($json->user('api'))) {
            return ['custId' => null, 'employee' => true];
        }

        return null;
    }

    protected function wantsBagRows(Request $json): bool
    {
        if ($json->filled('bag')) {
            return filter_var($json->input('bag'), FILTER_VALIDATE_BOOLEAN);
        }
        if ($json->filled('scope')) {
            return in_array(strtolower((string) $json->input('scope')), ['bag', 'cart'], true);
        }
        if ($json->filled('tag_prefix')) {
            return str_starts_with(strtoupper((string) $json->input('tag_prefix')), 'CART-');
        }

        return false;
    }

    protected function ordersQuery(?int $custId)
    {
        $query = Order::with([
                'items.bag.prodvar.product',
                'pickup.appointment',
                'delivery',
                'parcel.delivery',
                'parcel.payment',
                'customer',
            ]);

        if ($custId !== null) {
            $query->where('cust_id', $custId);
        } else {
            $query->where(function ($builder) {
                $builder->whereHas('pickup')
                    ->orWhereHas('delivery')
                    ->orWhere('ord_status', '!=', 'processing')
                    ->orWhereExists(function ($q) {
                        $q->select(DB::raw(1))
                            ->from('items')
                            ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                            ->whereColumn('items.ord_id', 'orders.ord_id')
                            ->where('bag.bag_placed', true);
                    });
            });
        }

        return $query;
    }

    protected function orderScopeCartCount(?int $custId): int
    {
        return $custId === null ? 0 : self::cartCount($custId);
    }

    protected function applyOrderFilter($query, string $filter): void
    {
        $buckets = [
            'processing'      => ['processing', 'to cancel', 'to process', 'cancel requested', 'cancelling', 'return requested'],
            'to-claim'        => ['to claim', 'to receive', 'delivering', 'transit'],
            'claimed'         => ['claimed', 'received', 'delivered', 'completed'],
            'unclaimed'       => ['unclaimed'],
            'cancelled'       => ['cancelled', 'cancel', 'canceled', 'returned', 'refunded'],
            'cancel requests' => ['to cancel', 'cancel requested', 'return requested'],
        ];

        $aliases = [
            'all'              => 'all',
            'to claim/receive' => 'to-claim',
            'to-claim-receive' => 'to-claim',
            'claimed/received' => 'claimed',
            'claimed-received' => 'claimed',
        ];

        $key = strtolower(trim($filter));
        $key = $aliases[$key] ?? $key;
        if ($key === 'all' || ! isset($buckets[$key])) {
            return;
        }

        $statuses = $buckets[$key];
        $query->whereRaw(
            'LOWER(TRIM(ord_status)) IN (' . implode(',', array_fill(0, count($statuses), '?')) . ')',
            $statuses
        );
    }

    protected function ordersPayload($orders): array
    {
        $orders = collect($orders)->values();

        $products = [];
        foreach ($orders as $order) {
            $order->loadMissing('items.bag.prodvar.product');
            foreach ($order->items as $item) {
                $product = $item->bag?->prodvar?->product;
                if ($product !== null) {
                    $products[] = $product;
                }
            }
        }
        ProductsAPI::primePresentations($products);

        return $orders->map(fn ($o) => $this->orderPayload($o))->values()->all();
    }

    protected function orderPayload(Order $order): array
    {
        $order->loadMissing([
            'items.bag.prodvar.product', 'pickup.appointment',
            'delivery', 'parcel.delivery', 'parcel.payment', 'customer',
        ]);

        $items   = $order->items->map(fn ($item) => $this->itemPayload($item))->values()->all();
        $payload = $order->toArray();
        $payload['items']    = $items;
        $payload['status']   = $order->ord_status;
        $payload['claiming'] = $order->ord_claiming ?? null;
        $payload['created']  = $order->ord_created ?? null;

        $walkIn = $order->pickup === null && $order->delivery === null;
        $payload['is_walk_in']  = $walkIn;
        $payload['walk_in']     = $walkIn;
        $payload['customer']    = $order->customer ? [
            'cust_id'       => $order->customer->cust_id,
            // Spec section 6: `cust_nickname` is the derived full-name alias.
            'cust_nickname' => trim(($order->customer->cust_givname ?? '') . ' ' . ($order->customer->cust_surname ?? '')),
            'cust_email'    => $order->customer->cust_email,
            'cust_phone'    => $order->customer->cust_phone,
            'cust_givname'  => $order->customer->cust_givname,
            'cust_surname'  => $order->customer->cust_surname,
        ] : null;
        $payload['customer_name'] = $payload['customer']
            ? $payload['customer']['cust_nickname']
            : null;

        $lineTotal = round((float) array_sum(array_column($items, 'line_total')), 2);
        $ordAmount = $order->getAttribute('ord_amount');
        $amount    = $ordAmount !== null && $ordAmount !== '' ? round((float) $ordAmount, 2) : $lineTotal;

        $payload['ord_amount'] = $amount;
        $payload['amount']     = $amount;
        $payload['total']      = $amount;

        $payment = $order->parcel?->payment ?? null;
        if ($payment) {
            $payload['pay_ref']       = $payment->pay_ref;
            $payload['pay_given']     = (float) $payment->pay_given;
            $payload['pay_due']       = (float) $payment->pay_due;
            $payload['pay_change']    = (float) $payment->pay_change;
            $payload['pay_reference'] = $payment->pay_ref;
        }

        $appointment = $order->pickup?->appointment ?? null;
        if ($appointment) {
            $payload['dispatch_type']  = 'pickup';
            $payload['appoint_id']     = $appointment->appoint_id;
            $payload['appoint_start']  = $appointment->appoint_start;
            $payload['appoint_end']    = $appointment->appoint_end;
            $payload['appoint_type']   = $appointment->appoint_type;
            $payload['appoint_status'] = $appointment->appoint_status;
            $payload['appoint_qr']     = $appointment->appoint_qr;
            $payload['appoint_closed'] = $appointment->appoint_closed;
        }

        $delivery = $order->parcel?->delivery ?? $order->delivery ?? null;
        if ($delivery) {
            $payload['dispatch_type']      = 'delivery';
            $payload['deliver_id']         = $delivery->deliver_id;
            $payload['deliver_qr']         = $delivery->deliver_qr;
            $payload['deliver_address']    = $delivery->deliver_address;
            $payload['deliver_phone']      = $delivery->deliver_phone;
            $payload['deliver_recipient']  = $delivery->deliver_recipient;
            $payload['deliver_expect']     = $delivery->deliver_expect;
            $payload['deliver_end']        = $delivery->deliver_end;
            $payload['deliver_placed']     = $delivery->deliver_placed;
            $payload['deliver_pickedup']   = $delivery->deliver_pickedup;
            $payload['deliver_completed']  = $delivery->deliver_completed;
            $payload['deliver_notes']      = $delivery->deliver_notes;
            $payload['deliver_service']    = $delivery->deliver_service;
            $payload['deliver_fee_charged'] = $delivery->deliver_fee_charged;
            $payload['deliver_fee_actual']  = $delivery->deliver_fee_actual;
            $payload['deliver_share_link']  = $delivery->deliver_share_link;
            $payload['deliver_last_event']  = $delivery->deliver_last_event;
        }

        $payload['is_preorder'] = $order->pickup !== null
            || $order->parcel !== null
            || $delivery !== null;

        return $payload;
    }

    protected function itemPayload(Item $item): array
    {
        $item->loadMissing('bag.prodvar.product');
        $bag     = $item->bag;
        $prodvar = $bag?->prodvar;
        $product = $prodvar?->product;
        $present = $product ? ProductsAPI::present($product) : null;

        $qty  = $bag ? max(0, (int) $bag->bag_qty) : 0;
        $unit = $bag
            ? round((float) $bag->bag_amount, 2)
            : round((float) ($product?->prod_price ?? 0) + (float) ($prodvar?->prodvar_markup ?? 0), 2);
        $lineTotal = round($qty * $unit, 2);

        return [
            'item_id'    => $item->item_id,
            'ord_id'     => $item->ord_id,
            'bag_id'     => $bag ? (int) $bag->bag_id : (int) $item->bag_id,
            'prod_id'    => $product?->prod_id,
            'prod_tag'   => $product?->prod_tag,
            'prod_name'  => $product?->prod_name,
            'prodvar_id' => $prodvar ? (int) $prodvar->prodvar_id : ($bag ? (int) $bag->prodvar_id : null),
            'prodvar'    => $prodvar?->toArray(),
            'qty'        => $qty,
            'amount'     => $unit,
            'line_total' => $lineTotal,
            'item_qty'    => $qty,
            'item_amount' => $lineTotal,
            'product'     => $present,
            'available'   => $present ? (bool) ($present['available'] ?? false) : false,
        ];
    }

    public function addWishlistItem(Request $json)
    {
        $validator = (new DatabaseAPI())->addWishlistItem($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $customer = Customer::where('cust_id', $custId)->first();
            if (!$customer) {
                return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            if (!$product) {
                return response()->json(['success' => false, 'message' => 'Product not found'], 404);
            }

            $resolvedProdId = $product->prod_id;

            $existing = Wishlist::where('cust_id', $custId)
                ->where('prod_id', $resolvedProdId)
                ->first();

            $created = false;
            if ($existing && $existing->wish_hidden === null) {
                $message = 'Item already in wishlist';
            } else {
                if ($existing) {
                    Wishlist::where('cust_id', $custId)
                        ->where('prod_id', $resolvedProdId)
                        ->update([
                            'wish_hidden' => null,
                            'wish_created' => now(),
                        ]);
                } else {
                    Wishlist::create([
                        'wish_id'      => $this->nextId('wishlist', 'wish_id'),
                        'cust_id'     => $custId,
                        'prod_id'     => $resolvedProdId,
                        'wish_created' => now(),
                        'wish_hidden' => null,
                    ]);
                }
                $created = true;
                $message = 'Item added to wishlist successfully';
            }

            $this->syncWishlistCounter($custId);
            $this->logCustomer($custId, 'edit', 'POST /api/wishlist/add');

            return response()->json([
                'success' => true,
                'message' => $message,
                'data' => [
                    'cust_id' => $custId,
                    'prod_id' => $resolvedProdId,
                    'cust_wishlist_count' => (int) (Customer::where('cust_id', $custId)->value('cust_wishlist') ?? 0),
                ]
            ], $created ? 201 : 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add wishlist item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function addWishlistToOrder(Request $json)
    {
        $validator = (new DatabaseAPI())->addWishlistToOrder($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            if (!$product) {
                return response()->json(['success' => false, 'message' => 'Product not found'], 404);
            }

            if (!$product->isBuyable()) {
                return response()->json(['success' => false, 'message' => 'Product is no longer offered'], 400);
            }

            $wishlistItem = Wishlist::where('cust_id', $custId)
                ->where('prod_id', $product->prod_id)
                ->whereNull('wish_hidden')
                ->first();
            if (!$wishlistItem) {
                return response()->json(['success' => false, 'message' => 'Wishlist item not found.'], 404);
            }

            $prodvar = UserAPI::resolveVariation(
                $product,
                $json->input('prodvar_id'),
                $json->input('size'),
                $json->input('color'),
                $json->input('options')
            );
            if (!$prodvar) {
                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                ], 400);
            }

            $qty = max(1, (int) $json->input('item_qty', 1));
            $sent = $json->input('item_amount');
            $unit = $sent !== null && $sent !== ''
                ? round((float) $sent, 2)
                : round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2);

            UserAPI::upsertBagLine($custId, $prodvar, $qty, $unit);
            UserAPI::syncCartCounter($custId);
            $this->logCustomer($custId, 'edit', 'POST /api/wishlist/to_order');

            return response()->json([
                'success' => true,
                'message' => 'Wishlist item added to cart successfully',
                'data'    => UserAPI::cartEnvelope($custId),
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add wishlist item to order',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function displayWishlist(Request $json)
    {
        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }
            if (!$custId) {
                return response()->json(['success' => false, 'message' => 'Customer ID is required'], 400);
            }

            if (!Customer::where('cust_id', $custId)->exists()) {
                return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
            }

            $this->logView($json, 'wishlist');

            $items = Wishlist::with('product')
                ->where('cust_id', $custId)
                ->whereNull('wish_hidden')
                ->orderByDesc('wish_created')
                ->get();

            ProductsAPI::primePresentations($items->pluck('product')->filter()->all());

            $this->syncWishlistCounter($custId);

            return response()->json([
                'success' => true,
                'message' => 'Wishlist retrieved successfully',
                'data' => [
                    'cust_id' => $custId,
                    'wishlist_count' => $items->count(),
                    'items' => $items->map(fn ($wish) => $this->wishlistPayload($wish))->values()->all(),
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to display wishlist',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function removeWishlistItem(Request $json)
    {
        $validator = (new DatabaseAPI())->removeWishlistItem($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            $resolvedProdId = $product ? $product->prod_id : $json->input('prod_id');

            Wishlist::where('cust_id', $custId)
                ->where('prod_id', $resolvedProdId)
                ->whereNull('wish_hidden')
                ->update(['wish_hidden' => now()]);

            $this->syncWishlistCounter($custId);
            $this->logCustomer($custId, 'edit', 'DELETE /api/wishlist/remove');

            return response()->json([
                'success' => true,
                'message' => 'Item removed from wishlist successfully',
                'data' => [
                    'cust_id' => $custId,
                    'prod_id' => $resolvedProdId,
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove wishlist item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function updateWishlistItem(Request $json)
    {
        $validator = (new DatabaseAPI())->updateWishlistItem($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            if (!$product) {
                return response()->json(['success' => false, 'message' => 'Product not found.'], 404);
            }

            $this->logCustomer($custId, 'edit', 'PUT /api/wishlist/update');

            return response()->json([
                'success' => true,
                'message' => 'Wishlist item details updated successfully',
                'data' => [
                    'cust_id' => $custId,
                    'prod_id' => $product->prod_id,
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update wishlist item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    protected function wishlistPayload(Wishlist $wish): array
    {
        $product = $wish->product;
        $available = $product !== null
            && $product->prod_disabled === null
            && $product->prod_deleted === null;

        $payload = $wish->toArray();
        unset($payload['product']);

        $payload['prod_id']     = $wish->prod_id;
        $payload['available']   = $available;
        $payload['unavailable'] = !$available;
        $payload['product']     = $product ? ProductsAPI::present($product) : null;

        return $payload;
    }

    protected function syncWishlistCounter(int $custId): void
    {
        $count = Wishlist::where('cust_id', $custId)->whereNull('wish_hidden')->count();

        Customer::where('cust_id', $custId)->update(['cust_wishlist' => $count]);
    }

    protected function wishlistResolveProduct($prodKey): ?Product
    {
        if ($prodKey === null || $prodKey === '') {
            return null;
        }

        if (is_numeric($prodKey)) {
            $product = Product::find((int) $prodKey);
            if ($product) {
                return $product;
            }
        }

        return Product::where('prod_tag', (string) $prodKey)->first();
    }

        public function customerSignup(Request $json)
        {

            $validator = (new DatabaseAPI())->customerSignup($json);
            if ($validator) return $validator;

            $email    = strtolower(trim((string) $json->input('email')));
            $phone    = (string) $json->input('phone');
            $password = (string) $json->input('password');

            $guest = $this->normalizeSignupType($json->input('type')) !== 'bueno';

            $categ   = $guest ? null : (strtolower((string) $json->input('cust_categ')) ?: 'student');
            $college = $guest ? null : (trim((string) $json->input('cust_college')) ?: null);
            $dept    = $guest ? null : (trim((string) $json->input('cust_dept')) ?: null);

            if ($email !== '' && Customer::where('cust_email', $email)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'That email address is already registered.'
                ], 409);
            }

            if (Customer::where('cust_phone', $phone)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'That phone number is already registered.'
                ], 409);
            }

            try {
                $customer = Customer::create(
                    $this->signupAttributes($json, $email, $phone, $password, $guest, $categ, $college, $dept)
                );

                [$code, $error] = $this->issueOtpCode($customer, 'signup');

                $this->logCustomer((int) $customer->cust_id, 'authentication',
                    'POST /api/auth/cust_signup - account created, phone OTP pending');

                Cache::put(
                    $this->signupPendingKey((int) $customer->cust_id),
                    ['email' => $email, 'phone' => $phone, 'ts' => now()->timestamp],
                    now()->addDays(7)
                );

                return response()->json([
                    'success' => true,
                    'message' => $code !== null
                        ? 'Verification code sent to your notification inbox.'
                        : (string) $error,
                    'data' => [
                        'requires_otp' => true,
                        'purpose'      => 'signup',
                        'challenge'    => ApiToken::challenge($customer, 'signup'),
                        'phone'        => $this->maskPhone($customer->cust_phone),
                        'delivery'     => 'in_app_notification',
                        'expires_in'   => self::otpTtlMinutes * 60,
                        'cust_id'      => (int) $customer->cust_id,
                    ],
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        private function signupAttributes(
            Request $json,
            string $email,
            string $phone,
            string $password,
            bool $guest,
            ?string $categ,
            ?string $college,
            ?string $dept
        ): array {
            $address = trim((string) ($json->input('address')
                ?: implode(', ', array_filter([
                    $json->input('brgy'),
                    $json->input('city'),
                    $json->input('province'),
                    $json->input('country'),
                ]))));
            $bday = (string) ($json->input('bday') ?: $json->input('birthday'));

            $attributes = [
                'cust_id'       => $this->nextId('customer', 'cust_id'),
                'cust_created'  => now(),
                'cust_password' => Hash::make($password),
                'cust_callcode' => $json->input('callcode') ?: '+63',
                'cust_pronoun'  => $json->input('pronoun') ?: 'they/them',
                'cust_phone'    => $phone,
                'cust_email'    => $email !== '' ? $email : null,
                'cust_type'     => $guest ? 'guest' : 'BUeño',
                'cust_college'  => $college,
                'cust_wishlist' => 0,
                'cust_orders'   => 0,
            ];

            if (Schema::hasColumn('customer', 'cust_givname')) {
                return $attributes + [
                    'cust_givname'             => trim((string) $json->input('givname')),
                    'cust_surname'             => trim((string) $json->input('surname')),
                    'cust_address'             => $address !== '' ? $address : null,
                    'cust_bday'                => $bday !== '' ? $bday : null,
                    'cust_avatar'              => null,
                    'cust_categ'               => $categ,
                    'cust_dept'                => $dept,
                    'cust_backup_phone'        => trim((string) ($json->input('backup_phone') ?: $json->input('backupphone'))) ?: null,
                    'cust_backup_email'        => strtolower(trim((string) ($json->input('backup_email') ?: $json->input('backupemail')))) ?: null,
                    'cust_backup_ques'         => null,
                    'cust_backup_answer'       => null,
                    'cust_backup_code'         => '/',
                    'cust_darkmode'            => false,
                    'cust_deleted'             => null,
                    'cust_suspended'           => null,
                    'cust_login_active'        => null,
                    'cust_login_failed'        => null,
                    'cust_last_logout'         => null,
                    'cust_notif_appointremind' => 10,
                    'cust_notif_email'         => false,
                    'cust_notif_prod'          => false,
                    'cust_appoint'             => 0,
                    'cust_bag'                 => 0,
                    'cust_unread'              => 0,
                ];
            }

            return $attributes + [
                'cust_nickname'  => trim((string) $json->input('givname') . ' ' . (string) $json->input('surname')),
                'cust_birthday'  => $bday !== '' ? $bday : '2000-01-01',
                'cust_brgy'      => (string) $json->input('brgy'),
                'cust_city'      => (string) $json->input('city'),
                'cust_province'  => (string) $json->input('province'),
                'cust_country'   => (string) ($json->input('country') ?: ''),
                'cust_cart'      => 0,
                'cust_appoints'  => 0,
            ];
        }

        public function employeeSignup(Request $json)
        {

            $validator = (new DatabaseAPI())->employeeSignup($json);
            if ($validator) {
                $this->logEnrollment($json, 'FAILED', $validator->getData()['message'] ?? 'rejected');

                return $validator;
            }

            $email = strtolower(trim((string) $json->input('email')));
            $temporaryPassword = EmployeePassword::generateTemporary(20);
            $type = $this->employeeCategory($json);

            if (Employee::where('emp_email', $email)->exists()) {
                $this->logEnrollment($json, 'FAILED', 'duplicate email ' . $email);

                return response()->json([
                    'success' => false,
                    'message' => 'Email already exists',
                ], 409);
            }

            $shiftBlocks = $this->enrollmentShiftBlocks($json);
            $shiftProblem = $this->enrollmentShiftProblem($shiftBlocks);
            if ($shiftProblem !== null) {
                $this->logEnrollment($json, 'FAILED', 'invalid schedule - ' . $shiftProblem);

                return response()->json([
                    'success' => false,
                    'message' => $shiftProblem,
                ], 422);
            }

            try {
                $phone = (string) $json->input('phone');
                $cleanedPhone = preg_replace('/[^0-9]/', '', $phone);
                if (str_starts_with($cleanedPhone, '63') && strlen($cleanedPhone) === 12) {
                    $cleanedPhone = '0' . substr($cleanedPhone, 2);
                }

                $attributes = [
                    'emp_id' => $this->nextId('employee', 'emp_id'),
                    'emp_created' => now(),
                    'emp_password' => EmployeePassword::makeTemporary($temporaryPassword),
                    'emp_surname' => $json->input('surname'),
                    'emp_givname' => $json->input('givname'),
                    'emp_midname' => $json->input('midname', ''),
                    'emp_suffix' => $json->input('suffix', ''),
                    'emp_studnum' => $json->input('studnum'),
                    'emp_college' => $json->input('college'),
                    'emp_program' => $json->input('program'),
                    'emp_year' => $json->input('year'),
                    'emp_bloc' => $json->input('bloc'),
                    'emp_pronoun' => $json->input('pronoun', 'they/them'),
                    'emp_birthday' => $json->input('birthday', '2000-01-01'),
                    'emp_brgy' => $json->input('brgy', ''),
                    'emp_city' => $json->input('city', ''),
                    'emp_province' => $json->input('province', ''),
                    'emp_country' => $json->input('country', 'PH'),
                    'emp_callcode' => $json->input('callcode', '+63'),
                    'emp_phone' => $cleanedPhone !== '' ? $cleanedPhone : $phone,
                    'emp_email' => $email,
                    'emp_categ' => $type,
                    'emp_type' => strtoupper($type),
                    'emp_instore' => (bool) $json->input('instore', false),
                    'emp_present' => (bool) $json->input('instore', false),
                    'emp_suspended' => null,
                    'emp_deleted' => null,
                ];

                $employee = Employee::forceCreate(
                    $this->existingColumns('employee', $attributes)
                );

                $this->prescheduleNewEmployee((int) $employee->emp_id, $shiftBlocks);

                $this->mailTemporaryPassword($employee, $temporaryPassword);

                $by = $json->user('api');
                EmpLog::forceCreate(
                    $this->existingColumns('emplog', [
                        'emplog_id'      => $this->nextId('emplog', 'emplog_id'),
                        'emp_id'         => $employee->emp_id,
                        'emplog_created' => now(),
                        'emplog_access'  => 'edit',
                        'emplog_endpoint' => 'POST /api/auth/emp_signup',
                        'emplog_action'  => 'REGISTER',
                        'emplog_desc'    => 'Registered employee ' . $employee->emp_id . ' ('
                            . $employee->emp_givname . ' ' . $employee->emp_surname . ') as '
                            . $type . ' by super admin '
                            . ($by instanceof Employee ? $by->emp_id : 'unknown')
                            . '. Reason: new employee onboarding.',
                    ])
                );

                $this->logEnrollment($json, 'ENROLLED', $email . ' as ' . $type);

                return response()->json([
                    'success' => true,
                    'message' => 'Employee enrolled. Share the temporary password securely.',
                    'data' => array_merge($employee->toArray(), [
                        'temporary_password' => $temporaryPassword,
                        'must_change_password' => true,
                        'emp_categ' => $type,
                    ]),
                ], 201);
            } catch (\Exception $e) {
                $this->logEnrollment($json, 'FAILED', $email . ' - ' . $e->getMessage());

                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        private function employeeCategory(Request $json): string
        {
            $raw = (string) ($json->input('categ') ?: $json->input('type') ?: 'STAFF');
            $raw = strtolower(trim($raw));

            return match (true) {
                str_contains($raw, 'super') => 'super admin',
                str_contains($raw, 'admin') => 'admin',
                default => 'staff',
            };
        }

        private function prescheduleNewEmployee(int $empId, array $blocks = []): void
        {
            try {
                if (! Schema::hasTable('schedules')) {
                    return;
                }

                if ($blocks === []) {
                    $start = now();
                    Schedule::forceCreate([
                        'sched_id'         => $this->nextId('schedules', 'sched_id'),
                        'emp_id'           => $empId,
                        'sched_time_start' => $start,
                        'sched_time_end'   => $start->copy()->addDays(7),
                        'sched_created'    => now(),
                        'sched_disabled'   => null,
                    ]);

                    return;
                }

                foreach ($blocks as $block) {
                    Schedule::forceCreate([
                        'sched_id'         => $this->nextId('schedules', 'sched_id'),
                        'emp_id'           => $empId,
                        'sched_time_start' => Carbon::parse($block['shift_date'] . ' ' . $block['shift_start']),
                        'sched_time_end'   => Carbon::parse($block['shift_date'] . ' ' . $block['shift_end']),
                        'sched_created'    => now(),
                        'sched_disabled'   => null,
                    ]);
                }
            } catch (\Throwable $e) {
            }
        }

        private function enrollmentShiftBlocks(Request $json): array
        {
            $rows = $json->input('shifts');
            if (! is_array($rows) || $rows === []) {
                return [];
            }

            $blocks = [];
            foreach ($rows as $row) {
                if (! is_array($row)) {
                    continue;
                }

                $date = trim((string) ($row['shift_date'] ?? ''));
                $start = trim((string) ($row['shift_start'] ?? ''));
                $end = trim((string) ($row['shift_end'] ?? ''));

                if ($date === '' || $start === '' || $end === '') {
                    continue;
                }

                $blocks[] = ['shift_date' => $date, 'shift_start' => $start, 'shift_end' => $end];
            }

            return $blocks;
        }

        private function enrollmentShiftProblem(array $blocks): ?string
        {
            $floor = (int) SystemSettings::get('min_weekly_minutes', 180);

            $weekMinutes = [];
            $windows = [];

            foreach ($blocks as $block) {
                $start = Carbon::parse($block['shift_date'] . ' ' . $block['shift_start']);
                $end = Carbon::parse($block['shift_date'] . ' ' . $block['shift_end']);

                if ($start->minute % 10 !== 0 || $end->minute % 10 !== 0) {
                    return 'Duty shifts must be set in 10-minute intervals (for example: 09:00, 09:10, or 09:20).';
                }

                if (! $start->isFuture() && $start->lt(now()->subDay())) {
                    return 'Duty shift start time cannot be scheduled in the past.';
                }

                foreach ($windows as $window) {
                    if ($start->lt($window['end']) && $end->gt($window['start'])) {
                        return 'Duty shift from ' . $block['shift_start'] . ' to ' . $block['shift_end'] . ' overlaps another shift on the same day.';
                    }
                }
                $windows[] = ['start' => $start, 'end' => $end];

                if ($floor > 0) {
                    $weekKey = $start->copy()->startOfWeek()->toDateString();
                    $weekMinutes[$weekKey] = ($weekMinutes[$weekKey] ?? 0) + $start->diffInMinutes($end);
                }
            }

            foreach ($weekMinutes as $weekKey => $minutes) {
                if ($minutes < $floor) {
                    return 'The weekly duty schedule must total at least ' . $floor . ' minutes (3 hours). Currently scheduled: ' . $minutes . ' minutes.';
                }
            }

            return null;
        }

        private function mailTemporaryPassword(Employee $employee, string $temporaryPassword): void
        {
            try {
                $body = "Hello {$employee->emp_givname},\n\n"
                    . "Your staff account for Tindahan ni Isko has been enrolled "
                    . "as {$employee->emp_email}.\n\n"
                    . "Temporary password: {$temporaryPassword}\n\n"
                    . "You must change this password the first time you sign in. "
                    . "Contact a super admin if you did not expect this account.\n";

                Mail::raw($body, function ($message) use ($employee) {
                    $message->to($employee->emp_email)
                        ->subject('Your Tindahan ni Isko staff account');
                });
            } catch (\Throwable $e) {
            }
        }

        private function logEnrollment(Request $json, string $outcome, string $detail): void
        {
            $by = $json->user('api');

            if (! $by instanceof Employee) {
                return;
            }

            $this->logEmployee(
                (int) $by->emp_id,
                'edit',
                'POST /api/auth/emp_signup - ' . $outcome . ': ' . $detail
            );
        }

        public function backupCredentials(Request $json)
        {
            try {
                return $this->performBackupCredentials($json);
            } catch (\Throwable $e) {
                report($e);

                return $this->fail('Could not update the backup contacts. Please try again.', 500);
            }
        }

        private function performBackupCredentials(Request $json)
        {
            $validator = (new DatabaseAPI())->backupCredentials($json);
            if ($validator) {
                return $validator;
            }

            $user = $json->user();
            $fields = array_filter([
                'backupcallcode' => $json->input('backupcallcode'),
                'backupphone' => $json->input('backupphone'),
                'backupemail' => $json->input('backupemail'),
            ], static fn ($value) => $value !== null && $value !== '');

            if (! $user instanceof Customer && ! $user instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Account is not supported.'], 403);
            }

            $prefix = $user instanceof Employee ? 'emp' : 'cust';

            $updates = [];

            if (isset($fields['backupphone'])) {
                $updates[$prefix . '_backup_phone'] = $this->normalizeBackupPhone(
                    (string) $fields['backupphone'],
                    (string) ($fields['backupcallcode'] ?? '')
                );
            }

            if (isset($fields['backupemail'])) {
                $updates[$prefix . '_backup_email'] = trim((string) $fields['backupemail']);
            }

            if ($updates !== []) {
                $user->update($updates);
            }

            if ($user instanceof Employee) {
                $this->logEmployee((int) $user->emp_id, 'edit',
                    'POST /api/auth/backup_credentials - backup contacts updated');
            } else {
                $this->logCustomer((int) $user->cust_id, 'edit',
                    'POST /api/auth/backup_credentials - backup contacts updated');
            }

            return response()->json([
                'success' => true,
                'message' => 'Backup credentials updated successfully',
                'data' => $user,
            ]);
        }

        private function normalizeBackupPhone(string $phone, string $callcode): string
        {
            $phone = trim($phone);

            if ($phone === '' || $callcode === '' || str_starts_with($phone, '+')) {
                return $phone;
            }

            $digits = preg_replace('/\D+/', '', $phone) ?? '';
            $code = preg_replace('/\D+/', '', $callcode) ?? '';

            if ($digits === '' || $code === '') {
                return $phone;
            }

            if (str_starts_with($digits, '0')) {
                $digits = substr($digits, 1);
            }

            return '+' . $code . $digits;
        }

        public function updateCredentials(Request $json)
        {
            try {
                return $this->performUpdateCredentials($json);
            } catch (\Throwable $e) {
                report($e);

                return $this->fail('Could not update the credentials. Please try again.', 500);
            }
        }

        private function performUpdateCredentials(Request $json)
        {
            $validator = (new DatabaseAPI())->updateCredentials($json);
            if ($validator) {
                return $validator;
            }

            $user = $json->user();
            $passwordField = $user instanceof Customer ? 'cust_password' : 'emp_password';
            $changedField = $user instanceof Customer ? 'cust_cred_changed' : 'emp_cred_changed';

            $currentPasswordInput = (string) $json->input('current_password');
            $currentPasswordValid = false;

            if ($user instanceof Employee) {
                $verification = EmployeePassword::verify($currentPasswordInput, (string) $user->{$passwordField});
                $currentPasswordValid = (bool) ($verification['valid'] ?? false);
            } else {
                $currentPasswordValid = Hash::check($currentPasswordInput, (string) $user->{$passwordField});
            }

            if (! $currentPasswordValid) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current password is incorrect.',
                ], 422);
            }

            $gate = $this->otpGate($json, 'password_change');
            if ($gate) {
                return $gate;
            }

            if ($json->has('new_password_confirmation')
                && (string) $json->input('new_password_confirmation') !== (string) $json->input('new_password')) {
                return response()->json([
                    'success' => false,
                    'message' => 'New password confirmation does not match.',
                ], 422);
            }

            $employeeCategory = $user instanceof Employee
                ? (string) ($user->emp_categ ?: $user->emp_type)
                : '';
            $isSuperAdmin = in_array(
                strtoupper(str_replace([' ', '-'], '_', trim($employeeCategory))),
                ['SUPER_ADMIN', 'SUPERADMIN'],
                true
            );

            if ($isSuperAdmin && ! EmployeePassword::meetsStandard((string) $json->input('new_password'))) {
                return response()->json([
                    'success' => false,
                    'message' => 'Super admin passwords must be at least 16 characters and include an uppercase letter, a lowercase letter, a number and a symbol.',
                    'code' => 'WEAK_PASSWORD',
                ], 422);
            }

            $initialEmployeeGrace = $user instanceof Employee
                && ! $user->emp_cred_changed
                && $user->emp_created?->addHours(24)->isFuture();

            $blocked = $this->credentialChangeBlocked($user->{$changedField});
            if ($blocked && ! $initialEmployeeGrace) {
                return $blocked;
            }

            $update = [$passwordField => Hash::make($json->input('new_password'))];
            if ($user instanceof Customer) {
                if ($json->has('phone')) {
                    $update['cust_phone'] = $json->input('phone');
                }
                if ($json->has('email')) {
                    $update['cust_email'] = $json->input('email');
                }
            } else {
                if ($json->has('phone')) {
                    $update['emp_phone'] = $json->input('phone');
                }
                if ($json->has('email')) {
                    $requested = mb_strtolower(trim((string) $json->input('email')));
                    $current = mb_strtolower(trim((string) $user->emp_email));

                    if ($requested !== '' && $requested !== $current) {
                        if (! $user instanceof Employee || ! $user->isAdmin()) {
                            return response()->json([
                                'success' => false,
                                'message' => 'Regular staff members may not change an email address.',
                                'code' => 'EMAIL_LOCKED',
                            ], 403);
                        }

                        $taken = Employee::where('emp_email', $requested)
                            ->where('emp_id', '!=', $user->emp_id)
                            ->exists()
                            || Customer::where('cust_email', $requested)->exists();
                        if ($taken) {
                            return response()->json([
                                'success' => false,
                                'message' => 'Email already exists',
                            ], 409);
                        }

                        $update['emp_email'] = $requested;
                    }
                }
            }
            if (\Schema::hasColumn($user->getTable(), $changedField)) {
                $update[$changedField] = now();
            }
            $user->update($update);

            if ($user instanceof Employee) {
                $user->emp_login_active = null;
                $user->save();
            } else {
                $user->tokens()->delete();
            }

            $this->consumeOtp($json, 'password_change');

            if ($user instanceof Customer) {
                $this->logCustomer((int) $user->cust_id, 'edit',
                    'PUT /api/auth/update_credentials - password changed');
            } else {
                $this->logEmployee((int) $user->emp_id, 'edit',
                    'PUT /api/auth/update_credentials - password changed');
            }

            return response()->json([
                'success' => true,
                'message' => 'Credentials updated successfully. Please sign in again.',
            ]);
        }

    private const customerProfileRules = [
        'cust_givname' => 'sometimes|string|max:100',
        'cust_surname' => 'sometimes|string|max:100',
        'cust_pronoun' => 'sometimes|string|max:50',
        'cust_bday' => 'sometimes|nullable|date',
        'cust_address' => 'sometimes|nullable|string|max:4000',
        'cust_callcode' => 'sometimes|regex:/^\+?[0-9]{1,4}$/',
        'cust_phone' => 'sometimes|nullable|regex:/^[0-9]{10,11}$/',
        'cust_email' => 'sometimes|nullable|email:rfc',
        'cust_college' => 'sometimes|nullable|string|max:120',
        'cust_dept' => 'sometimes|nullable|string|max:120',
        'cust_categ' => 'sometimes|nullable|in:student,alumni,faculty',
        'cust_avatar' => 'sometimes|nullable|string',
        'cust_backup_phone' => 'sometimes|nullable|string|max:40',
        'cust_backup_email' => 'sometimes|nullable|email:rfc',
        'cust_darkmode' => 'sometimes|boolean',
        'cust_notif_appointremind' => 'sometimes|nullable|integer|min:0|max:1440',
        'cust_notif_email' => 'sometimes|boolean',
        'cust_notif_prod' => 'sometimes|boolean',
    ];

    private const maxAvatarBytes = 2048 * 1024;

    private const employeeProfileRules = [
        'emp_givname' => 'sometimes|string|max:100',
        'emp_surname' => 'sometimes|string|max:100',
        'emp_pronoun' => 'sometimes|string|max:50',
        'emp_callcode' => 'sometimes|regex:/^\+?[0-9]{1,4}$/',
        'emp_phone' => 'sometimes|nullable|regex:/^[0-9]{10,11}$/',
        'emp_email' => 'sometimes|nullable|email:rfc',
        'emp_avatar' => 'sometimes|nullable|string',
        'emp_backup_phone' => 'sometimes|nullable|string|max:40',
        'emp_backup_email' => 'sometimes|nullable|email:rfc',
        'emp_present' => 'sometimes|boolean',
        'emp_instore' => 'sometimes|boolean',
        'emp_darkmode' => 'sometimes|boolean',
        'emp_notif_appointremind' => 'sometimes|nullable|integer|min:0|max:1440',
        'emp_notif_email' => 'sometimes|boolean',
    ];

        private const customerPrefs = [
            'darkmode'           => 'cust_darkmode',
            'notif_appointremind'=> 'cust_notif_appointremind',
            'notif_email'        => 'cust_notif_email',
            'notif_prod'         => 'cust_notif_prod',
            'backup_phone'       => 'cust_backup_phone',
            'backup_email'       => 'cust_backup_email',
            'backup_ques'        => 'cust_backup_ques',
            'backup_answer'      => 'cust_backup_answer',
            'backup_code'        => 'cust_backup_code',
        ];

        private const employeePrefs = [
            'darkmode'           => 'emp_darkmode',
            'notif_appointremind'=> 'emp_notif_appointremind',
            'notif_email'        => 'emp_notif_email',
            'notif_prod'         => 'emp_notif_prod',
            'backup_phone'       => 'emp_backup_phone',
            'backup_email'       => 'emp_backup_email',
            'backup_ques'        => 'emp_backup_ques',
            'backup_answer'      => 'emp_backup_answer',
            'backup_code'        => 'emp_backup_code',
        ];

        private function isPreferenceKey(string $key): bool
        {
            foreach ([self::customerPrefs, self::employeePrefs] as $map) {
                if (array_key_exists($key, $map)) {
                    return true;
                }
                if (in_array($key, $map, true)) {
                    return true;
                }
                foreach ($map as $bare => $column) {
                    if ($key === $column || str_ends_with($key, '_' . $bare)) {
                        return true;
                    }
                }
            }

            return false;
        }

        private function castPreference(string $column, $value)
        {
            if (str_ends_with($column, '_darkmode') || str_ends_with($column, '_notif_email') || str_ends_with($column, '_notif_prod')) {
                return filter_var($value, FILTER_VALIDATE_BOOLEAN);
            }
            if (str_ends_with($column, '_notif_appointremind')) {
                return (int) $value;
            }
            if (str_ends_with($column, '_backup_phone') || str_ends_with($column, '_backup_email')) {
                return is_array($value)
                    ? implode('; ', array_values(array_filter(array_map('trim', $value))))
                    : $value;
            }

            return $value;
        }

        private function invalidPreference(array $preferences)
        {
            foreach ($preferences as $key => $value) {
                $key = (string) $key;

                if (str_contains($key, 'notif_appointremind')) {
                    if (filter_var($value, FILTER_VALIDATE_INT) === false
                        || (int) $value < 0 || (int) $value > 1440) {
                        return $this->fail('Appointment reminders must be a whole number of minutes between 0 and 1440.', 422);
                    }
                    continue;
                }

                if (str_contains($key, 'backup_email')) {
                    foreach ($this->contactList($value) as $email) {
                        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                            return $this->fail('Backup email addresses must be valid email addresses.', 422);
                        }
                    }
                    continue;
                }

                if (str_contains($key, 'backup_phone')) {
                    foreach ($this->contactList($value) as $phone) {
                        if (! preg_match('/^\+?[0-9][0-9\s-]{6,19}$/', $phone)) {
                            return $this->fail('Backup phone numbers must be valid phone numbers.', 422);
                        }
                    }
                    continue;
                }

                if (str_contains($key, 'backup_ques') || str_contains($key, 'backup_answer')
                    || str_contains($key, 'backup_code')) {
                    if (is_array($value) || strlen((string) $value) > 255) {
                        return $this->fail('Recovery details must be 255 characters or fewer.', 422);
                    }
                    continue;
                }

                if (str_contains($key, 'darkmode') || str_contains($key, 'notif_email')
                    || str_contains($key, 'notif_prod')) {
                    if (! is_bool($value) && ! in_array($value, [0, 1, '0', '1', 'true', 'false'], true)) {
                        return $this->fail('This setting accepts true or false only.', 422);
                    }
                }
            }

            return null;
        }

        private function contactList($value): array
        {
            if ($value === null || $value === '') {
                return [];
            }
            if (is_array($value)) {
                $value = implode(';', $value);
            }

            return array_values(array_filter(array_map('trim', preg_split('/[;,]+/', (string) $value))));
        }

        private function callerPreferences($user): array
        {
            if (!$user instanceof Customer && !$user instanceof Employee) {
                return [];
            }

            $map = $user instanceof Customer ? self::customerPrefs : self::employeePrefs;
            $prefs = [];
            foreach ($map as $bare => $column) {
                $value = $user->getAttribute($column);
                if ($value === null) {
                    continue;
                }
                $prefs[$column] = $value;
                $prefs[$bare]    = $value;
            }

            return $prefs;
        }

        private function payload($user): array
        {
            $settings = (new SystemAPI())->systemSettingsPayload();

            return array_merge($settings, $this->callerPreferences($user));
        }

        public function displaySettings(Request $json)
        {
            try {
                $user = $json->user('api');
                $settings = $this->payload($user);

                if ($user instanceof Employee) {
                    $this->logEmployee((int) $user->getKey(), 'view', 'GET /api/settings/display');
                } elseif ($user instanceof Customer) {
                    $this->logCustomer((int) $user->getKey(), 'view', 'GET /api/settings/display');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'System settings retrieved successfully',
                    'data' => $settings
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display settings.',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        public function updateSettings(Request $json)
        {
            $validator = (new DatabaseAPI())->updateSettings($json);
            if ($validator) return $validator;

            try {
                $user = $json->user('api');
                if (!$user instanceof Customer && !$user instanceof Employee) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Unauthenticated access.'
                    ], 403);
                }

                $newSettings = $json->input('settings');

                $preferences = [];
                $system      = [];
                foreach ((array) $newSettings as $key => $value) {
                    $key = (string) $key;
                    if ($this->isPreferenceKey($key)) {
                        $preferences[$key] = $value;
                    } else {
                        $system[$key] = $value;
                    }
                }

                if (!empty($system) && !$this->isSuperAdmin($user)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Only super admin employees may perform this action'
                    ], 403);
                }

                $endpoint = 'PUT /api/settings/update';

                $appliedPreferences = [];
                if (!empty($preferences)) {
                    $map    = $user instanceof Customer ? self::customerPrefs : self::employeePrefs;
                    $table  = $user instanceof Customer ? 'customer' : 'employee';
                    $keyCol = $user instanceof Customer ? 'cust_id' : 'emp_id';

                    $invalid = $this->invalidPreference($preferences);
                    if ($invalid !== null) {
                        return $invalid;
                    }

                    $updates = [];
                    foreach ($preferences as $key => $value) {
                        $column = $map[$key] ?? null;
                        if ($column === null) {
                            foreach ($map as $bare => $candidate) {
                                if ($key === $candidate || str_ends_with($key, '_' . $bare)) {
                                    $column = $candidate;
                                    break;
                                }
                            }
                        }
                        if ($column !== null) {
                            if (! \Schema::hasColumn($table, $column)) {
                                continue;
                            }
                            $updates[$column] = $this->castPreference($column, $value);
                            $appliedPreferences[] = (string) $key;
                        }
                    }

                    $backupTouched = array_key_exists('cust_backup_phone', $updates)
                        || array_key_exists('cust_backup_email', $updates);
                    if ($user instanceof Customer && $backupTouched) {
                        $gate = $this->otpGate($json, 'backup_contacts');
                        if ($gate) return $gate;
                    }

                    if (!empty($updates)) {
                        \DB::table($table)
                            ->where($keyCol, (int) $user->getKey())
                            ->update($updates);
                    }

                    if ($user instanceof Customer && $backupTouched) {
                        $this->consumeOtp($json, 'backup_contacts');
                    }
                }

                $systemProblem = (new SystemAPI())->applySystemSettings($system);
                if ($systemProblem !== null) {
                    return $systemProblem;
                }

                $changed = $appliedPreferences;
                if (!empty($system)) {
                    $changed = array_merge($changed, array_keys($system));
                }
                $endpoint .= $changed !== [] ? ' - ' . implode(', ', $changed) : '';

                if ($user instanceof Employee) {
                    $this->logEmployee((int) $user->getKey(), 'edit', $endpoint);
                } else {
                    $this->logCustomer((int) $user->getKey(), 'edit', $endpoint);
                }

                $user->refresh();

                return response()->json([
                    'success' => true,
                    'message' => empty($system)
                        ? 'Settings updated successfully'
                        : 'System settings updated successfully',
                    'data' => $this->payload($user)
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update settings.',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        public function displayNotifications(Request $json)
        {
            $recipientType = strtolower((string) $json->input('recipient_type', ''));
            if (!in_array($recipientType, ['customer', 'employee'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Recipient type must be either customer or employee'
                ], 400);
            }

            $user = $json->user('api');
            $recipientId = $json->input('recipient_id');

            try {
                if ($user instanceof Customer) {
                    if ($recipientType !== 'customer') {
                        return response()->json([
                            'success' => false,
                            'message' => 'Customers may only read their own notifications'
                        ], 403);
                    }
                    $recipientId = $user->getKey();
                } elseif ($user instanceof Employee) {
                    if ($recipientType !== 'employee') {
                        return response()->json([
                            'success' => false,
                            'message' => 'Employees may only read their own notifications'
                        ], 403);
                    }
                    $recipientId = $user->getKey();
                } else {
                    return response()->json(['success' => false, 'message' => 'Account is not supported.'], 403);
                }

                if ($recipientType === 'customer') {
                    $notifications = CustNotif::where('cust_id', $recipientId)
                        ->orderByRaw('CASE WHEN custnotif_read IS NULL THEN 0 ELSE 1 END')
                        ->orderByRaw("CASE WHEN custnotif_type = 'priority' THEN 0 ELSE 1 END")
                        ->orderBy('custnotif_created', 'desc')
                        ->get();
                } else {
                    $notifications = EmpNotif::where('emp_id', $recipientId)
                        ->orderByRaw('CASE WHEN empnotif_read IS NULL THEN 0 ELSE 1 END')
                        ->orderByRaw("CASE WHEN empnotif_type = 'priority' THEN 0 ELSE 1 END")
                        ->orderBy('empnotif_created', 'desc')
                        ->get();
                }

                $isOtpMessage = static function ($msg): bool {
                    $m = (string) $msg;
                    return preg_match('/\byour verification code is\b/i', $m) === 1
                        || preg_match('/\bverification code\b/i', $m) === 1;
                };

                $filteredNotifications = $notifications->reject(function ($notif) use ($recipientType, $isOtpMessage) {
                    $msg = $recipientType === 'customer'
                        ? $notif->custnotif_msg
                        : $notif->empnotif_msg;
                    return $isOtpMessage($msg);
                })->values();

                $this->logActor($json, 'view', 'GET /api/notif/display');

                return response()->json([
                    'success' => true,
                    'message' => 'Notifications retrieved successfully',
                    'data'    => $filteredNotifications
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display notifications.',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        public function updateNotificationStatus(Request $json)
        {
            $validator = (new DatabaseAPI())->updateNotificationStatus($json);
            if ($validator) return $validator;

            try {
                $notifId       = $json->input('notif_id');
                $recipientType = strtolower($json->input('recipient_type'));

                if ($recipientType === 'customer') {
                    $notif = CustNotif::where('custnotif_id', $notifId)->first();
                    if (! $notif || (int) $notif->cust_id !== $this->customerId($json)) {
                        return response()->json(['success' => false, 'message' => 'Customer notification not found'], 404);
                    }
                    if ($notif->custnotif_read) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Notification is already marked as read'
                        ], 400);
                    }
                    $notif->update(['custnotif_read' => now()]);
                } else {
                    $notif = EmpNotif::where('empnotif_id', $notifId)->first();
                    $employee = $json->user('api');
                    if (! $notif || ! $employee instanceof Employee || (int) $notif->emp_id !== (int) $employee->getKey()) {
                        return response()->json(['success' => false, 'message' => 'Employee notification not found'], 404);
                    }
                    if ($notif->empnotif_read) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Notification is already marked as read'
                        ], 400);
                    }
                    $notif->update(['empnotif_read' => now()]);
                }

                $this->logActor($json, 'edit', 'PUT /api/notif/update');

                return response()->json([
                    'success' => true,
                    'message' => 'Notification marked as read',
                    'data'    => $notif->fresh()
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update notification status',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

    public function displayMyAccount(Request $json)
    {
        $user = $json->user('api');

        if (! $user instanceof Customer && ! $user instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Please sign in to continue.',
            ], 403);
        }

        try {
            if ($user instanceof Customer) {
                $fresh = Customer::findOrFail($user->cust_id);
                $this->logCustomer((int) $fresh->cust_id, 'view', 'GET /api/accounts/me - own profile');
                $data = array_merge($fresh->toArray(), $this->customerAliases($fresh));
            } else {
                $fresh = Employee::findOrFail($user->emp_id);
                $this->logEmployee((int) $fresh->emp_id, 'view', 'GET /api/accounts/me - own profile');
                $data = array_merge($fresh->toArray(), $this->employeeAliases($fresh));
            }

            return response()->json([
                'success' => true,
                'message' => 'Account retrieved successfully',
                'data' => $data,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve account.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateAccountDetails(Request $json)
    {
        $validator = (new DatabaseAPI())->updateAccountDetails($json);
        if ($validator) return $validator;

        try {
            $userId = (int) $json->input('user_id');
            $accountType = strtolower($json->input('account_type'));
            $isCustomer = $accountType === 'customer';
            $actor = $json->user('api');

            if ($isCustomer) {
                $customerId = $this->customerId($json);
                if ($customerId === null || $customerId !== $userId) {
                    return response()->json(['success' => false, 'message' => 'Customer account mismatch.'], 403);
                }
                $user = Customer::findOrFail($userId);
            } else {
                if (! $actor instanceof Employee || (int) $actor->getKey() !== $userId) {
                    return response()->json(['success' => false, 'message' => 'Employees cannot edit another employee\'s personal details.'], 403);
                }
                $user = Employee::findOrFail($userId);
            }

            [$payload, $error] = $isCustomer
                ? $this->mapCustomerProfile($user, $json)
                : $this->mapEmployeeProfile($user, $json);

            if ($error !== null) {
                return $error;
            }

            if (! $isCustomer && array_key_exists('emp_email', $payload)) {
                $requestedEmail = (string) $payload['emp_email'];
                $currentEmail = mb_strtolower(trim((string) $user->emp_email));

                if ($requestedEmail !== '' && $requestedEmail !== $currentEmail) {
                    if (! $actor instanceof Employee || ! $actor->isAdmin()) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Regular staff members may not change an email address.',
                            'code' => 'EMAIL_LOCKED',
                        ], 403);
                    }
                } else {
                    unset($payload['emp_email']);
                }
            }

            if ($payload === []) {
                return response()->json([
                    'success' => false,
                    'message' => 'No updatable fields were supplied.',
                ], 422);
            }

            $rules = $isCustomer ? self::customerProfileRules : self::employeeProfileRules;
            $validator = Validator::make($payload, $rules);
            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => $validator->errors()->first(),
                    'errors' => $validator->errors(),
                ], 422);
            }

            if (array_key_exists('cust_email', $payload) && $payload['cust_email']) {
                $taken = Customer::where('cust_email', $payload['cust_email'])
                    ->where('cust_id', '!=', $user->cust_id)->exists()
                    || Employee::where('emp_email', $payload['cust_email'])->exists();
                if ($taken) {
                    return response()->json(['success' => false, 'message' => 'Email already exists'], 409);
                }
            }
            if (array_key_exists('cust_phone', $payload) && $payload['cust_phone']) {
                if (Customer::where('cust_phone', $payload['cust_phone'])
                    ->where('cust_id', '!=', $user->cust_id)->exists()) {
                    return response()->json(['success' => false, 'message' => 'Phone already exists'], 409);
                }
            }
            if (array_key_exists('emp_email', $payload) && $payload['emp_email']) {
                if (Employee::where('emp_email', $payload['emp_email'])
                    ->where('emp_id', '!=', $user->emp_id)->exists()
                    || Customer::where('cust_email', $payload['emp_email'])->exists()) {
                    return response()->json(['success' => false, 'message' => 'Email already exists'], 409);
                }
            }

            $availability = Employee::availabilityColumn();
            if (! $isCustomer && array_key_exists($availability, $payload)) {
                $blocked = $this->availabilityDeadlineBlocked($json, (int) $user->emp_id);
                if ($blocked) return $blocked;
            }

            $user->update($payload);

            if (! $isCustomer && array_key_exists($availability, $payload)) {
                $this->notifyStaffShortage();
                $this->announceBlocksPendingReplacement(
                    $this->staffBlocksNeedingCover($user)
                );
            }

            $endpoint = $isCustomer
                ? 'PUT /api/accounts/update - customer #' . $userId . ' profile'
                : 'PUT /api/accounts/update - employee #' . $userId . ' profile';
            if ($isCustomer) {
                $this->logCustomer($userId, 'edit', $endpoint);
            } else {
                $this->logEmployee($userId, 'edit', $endpoint . ' (by employee #' . $actor->emp_id . ')');
            }

            $fresh = $user->fresh();

            return response()->json([
                'success' => true,
                'message' => 'Account details updated successfully',
                'data' => $isCustomer
                    ? array_merge($fresh->toArray(), $this->customerAliases($fresh))
                    : array_merge($fresh->toArray(), $this->employeeAliases($fresh)),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update account details.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    private function mapCustomerProfile(Customer $user, Request $json): array
    {
        $payload = [];

        $givname = $json->input('cust_givname');
        $surname = $json->input('cust_surname');
        if ($givname !== null || $surname !== null) {
            if ($givname !== null) $payload['cust_givname'] = trim((string) $givname);
            if ($surname !== null) $payload['cust_surname'] = trim((string) $surname);
        } elseif ($json->has('cust_nickname')) {
            $full = trim((string) $json->input('cust_nickname'));
            if (str_contains($full, ' ')) {
                [$givname, $surname] = explode(' ', $full, 2);
                $payload['cust_givname'] = trim($givname);
                $payload['cust_surname'] = trim($surname);
            } else {
                $payload['cust_surname'] = $full;
                $payload['cust_givname'] = '';
            }
        }

        if ($json->has('cust_pronoun')) {
            $payload['cust_pronoun'] = (string) $json->input('cust_pronoun');
        }

        if ($json->has('cust_bday')) {
            $payload['cust_bday'] = $json->input('cust_bday');
        } elseif ($json->has('cust_birthday')) {
            $payload['cust_bday'] = $json->input('cust_birthday');
        }

        if ($json->has('cust_addresses')) {
            $list = $json->input('cust_addresses');
            if (! is_array($list)) {
                return [$payload, $this->addressError('Addresses must be sent as a list.')];
            }

            $entries = [];
            foreach ($list as $entry) {
                $entry = trim((string) $entry);
                if ($entry === '') {
                    continue;
                }
                if (mb_strlen($entry) > 300) {
                    return [$payload, $this->addressError('Each address must be 300 characters or fewer.')];
                }
                $entries[] = $entry;
            }

            if (count($entries) > 10) {
                return [$payload, $this->addressError('A customer may save up to 10 addresses.')];
            }

            $payload['cust_address'] = $entries !== [] ? implode(' | ', $entries) : null;
        } else {
            $addressKeys = ['cust_address', 'cust_brgy', 'cust_city', 'cust_province', 'cust_country'];
            if (array_intersect($addressKeys, array_keys($json->all()))) {
                $payload['cust_address'] = $this->rebuildAddress($user, $json);
            }
        }

        foreach (['cust_callcode', 'cust_college', 'cust_categ', 'cust_darkmode',
            'cust_notif_appointremind', 'cust_notif_email', 'cust_notif_prod'] as $key) {
            if ($json->has($key)) {
                $payload[$key] = $json->input($key);
            }
        }

        if ($json->has('cust_dept')) {
            $payload['cust_dept'] = $json->input('cust_dept');
        } elseif ($json->has('cust_course') || $json->has('dept')) {
            $payload['cust_dept'] = $json->input('cust_course') ?: $json->input('dept');
        }

        if ($json->has('cust_email')) {
            $email = mb_strtolower(trim((string) $json->input('cust_email')));
            if ($email === '' || $email === mb_strtolower(trim((string) $user->cust_email))) {
                $payload['cust_email'] = $user->cust_email;
            }
        }
        if ($json->has('cust_phone')) {
            $phone = $this->normalizePhone((string) $json->input('cust_phone'));
            if ($phone !== '') {
                $payload['cust_phone'] = $phone;
            }
        }

        if ($json->has('cust_avatar') || $json->has('cust_photo')) {
            $avatar = trim((string) ($json->input('cust_avatar') ?? $json->input('cust_photo')));
            if ($avatar !== '' && ! $this->avatarAllowed($avatar)) {
                return [$payload, response()->json([
                    'success' => false,
                    'message' => 'Profile photos must be a PNG, JPEG, GIF or WebP image.',
                ], 422)];
            }
            $payload['cust_avatar'] = $avatar !== '' ? $avatar : null;
        }

        if ($json->has('cust_backup_phone')) {
            $payload['cust_backup_phone'] = $json->input('cust_backup_phone');
        } elseif ($json->has('cust_backupphone')) {
            $combined = $this->combineBackupPhone(
                $json->input('cust_backupcallcode'),
                $json->input('cust_backupphone')
            );
            if ($combined !== null) $payload['cust_backup_phone'] = $combined;
        }
        if ($json->has('cust_backup_email')) {
            $payload['cust_backup_email'] = mb_strtolower(trim((string) $json->input('cust_backup_email'))) ?: null;
        } elseif ($json->has('cust_backupemail')) {
            $payload['cust_backup_email'] = mb_strtolower(trim((string) $json->input('cust_backupemail'))) ?: null;
        }

        return [$payload, null];
    }

    private function mapEmployeeProfile(Employee $user, Request $json): array
    {
        $payload = [];

        foreach (['emp_givname', 'emp_surname', 'emp_pronoun', 'emp_callcode', 'emp_darkmode',
            'emp_notif_appointremind', 'emp_notif_email'] as $key) {
            if ($json->has($key)) {
                $payload[$key] = $json->input($key);
            }
        }

        if ($json->has('emp_email')) {
            $email = mb_strtolower(trim((string) $json->input('emp_email')));
            if ($email !== '') {
                $payload['emp_email'] = $email;
            }
        }
        if ($json->has('emp_phone')) {
            $phone = $this->normalizePhone((string) $json->input('emp_phone'));
            if ($phone !== '') {
                $payload['emp_phone'] = $phone;
            }
        }

        if ($json->has('emp_avatar') || $json->has('emp_photo')) {
            $avatar = trim((string) ($json->input('emp_avatar') ?? $json->input('emp_photo')));
            $storedAvatar = trim((string) ($user->emp_avatar ?? ''));

            if ($avatar !== '' && $avatar !== $storedAvatar) {
                if (! $this->avatarAllowed($avatar)) {
                    return [$payload, response()->json([
                        'success' => false,
                        'message' => 'Profile avatars must be a PNG, JPEG, GIF or WebP image.',
                        'code' => 'AVATAR_FORMAT',
                    ], 422)];
                }

                $bytes = $this->avatarBytes($avatar);
                if ($bytes !== null && $bytes > self::maxAvatarBytes) {
                    return [$payload, response()->json([
                        'success' => false,
                        'message' => 'Profile avatars must be 2 MB or smaller.',
                        'code' => 'AVATAR_TOO_LARGE',
                    ], 422)];
                }
            }

            $payload['emp_avatar'] = $avatar !== '' ? $avatar : null;
        }

        $availability = Employee::availabilityColumn();
        if ($json->has('emp_present')) {
            $payload[$availability] = (bool) $json->input('emp_present');
        } elseif ($json->has('emp_instore')) {
            $payload[$availability] = (bool) $json->input('emp_instore');
        }

        if ($json->has('emp_backup_phone')) {
            $payload['emp_backup_phone'] = $json->input('emp_backup_phone');
        } elseif ($json->has('emp_backupphone')) {
            $combined = $this->combineBackupPhone(
                $json->input('emp_backupcallcode'),
                $json->input('emp_backupphone')
            );
            if ($combined !== null) $payload['emp_backup_phone'] = $combined;
        }
        if ($json->has('emp_backup_email')) {
            $payload['emp_backup_email'] = mb_strtolower(trim((string) $json->input('emp_backup_email'))) ?: null;
        } elseif ($json->has('emp_backupemail')) {
            $payload['emp_backup_email'] = mb_strtolower(trim((string) $json->input('emp_backupemail'))) ?: null;
        }

        return [$payload, null];
    }

    private function rebuildAddress(Customer $user, Request $json): ?string
    {
        if ($json->has('cust_address')) {
            $parts = explode(',', (string) $json->input('cust_address'));
        } else {
            $current = explode(',', (string) $user->cust_address);
            $parts = [
                $json->input('cust_brgy', $current[0] ?? ''),
                $json->input('cust_city', $current[1] ?? ''),
                $json->input('cust_province', $current[2] ?? ''),
                $json->input('cust_country', $current[3] ?? ''),
            ];
        }

        $parts = array_values(array_filter(array_map('trim', $parts), fn ($part) => $part !== ''));

        return $parts !== [] ? implode(', ', $parts) : null;
    }

    private function normalizePhone(string $phone): string
    {
        $cleaned = preg_replace('/[^0-9]/', '', $phone);
        if (strlen((string) $cleaned) >= 12 && strpos((string) $cleaned, '63') === 0) {
            $cleaned = '0' . substr((string) $cleaned, 2);
        }

        return (string) $cleaned;
    }

    private function combineBackupPhone($callcode, $phone): ?string
    {
        $phone = trim((string) $phone);
        if ($phone === '') {
            return null;
        }
        $callcode = trim((string) $callcode);

        return $callcode !== '' ? $callcode . ' ' . $phone : $phone;
    }

    private function addressError(string $message): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message], 422);
    }

    private function avatarAllowed(string $avatar): bool
    {
        if (preg_match('#^data:image/(png|jpe?g|gif|webp);base64,#i', $avatar)) {
            return true;
        }

        $path = strtolower((string) parse_url($avatar, PHP_URL_PATH));
        $ext = pathinfo($path, PATHINFO_EXTENSION);

        return in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)
            || in_array(ltrim($avatar, '.'), ['png', 'jpg', 'jpeg', 'gif', 'webp'], true);
    }

    private function avatarBytes(string $avatar): ?int
    {
        if (! preg_match('#^data:image/[a-z0-9.+-]+;base64,#i', $avatar, $matches)) {
            return null;
        }

        $encoded = substr($avatar, strlen($matches[0]));
        $decoded = base64_decode($encoded, true);

        return $decoded === false ? null : strlen($decoded);
    }

}
