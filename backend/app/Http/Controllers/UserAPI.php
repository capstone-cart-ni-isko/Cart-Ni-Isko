<?php

namespace App\Http\Controllers;

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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

/**
 * UserAPI
 *
 * DOMAIN 17 / 20 / 24 / 25 / 29 - the customer bag, wishlist, profile and settings, plus the employee-facing account surfaces.
 *
 * Repackaged from: Cart API, Wishlist API.
 */
class UserAPI extends Controller
{

    // ===== from the Cart API file =====
/**
 * DOMAIN 25 (BAG / CART) endpoints.
 *
 * The customer cart lives in the `bag` table: one live row per customer +
 * product variation (bag_placed = false, bag_deleted IS NULL). Different
 * variations of the same product NEVER merge into one row (REQ-BAG-01) -
 * the variation id is the identity of the line.
 *
 * The legacy cart built from `orders` rows tagged `CART-*` is retired: the
 * orders view below returns EVERY order the customer has, newest first
 * (FLOW-ORD_LIST-02) - there is no cart marker on `orders` any more, the
 * bag table is the cart - and gains the FLOW-ORD_LIST-03 server-side
 * `filter` buckets. Order line detail always comes from
 * items -> bag -> prodvar -> product; totals always from ord_amount.
 *
 * Every cart mutation answers with the same envelope the frontend reads:
 *   { success, message, data: { items: [cart item shape], cart_count, subtotal } }
 * `cart_count` (REQ-BAG-03) is the number of live bag rows; `subtotal`
 * (FLOW-BAG-06) is sum(bag_amount * bag_qty) - bag_amount is a UNIT amount.
 */

    // ===== from the Cart API file =====

    /** Columns of `customer` that mirror the live bag line count. */
    private static ?array $counterColumns = null;

    // ==========================================
    // ADD TO CART
    // ==========================================

    /*
        Adding a product (or one of its variations) to the bag
        ----------
        JSON REQUEST

        cust_id    - integer (opt: must match the token when sent)
        prod_id    - integer|string (req: product id or prod_tag)
        prodvar_id - integer (opt: explicit variation, wins over size/color)
        size       - string (opt: matched against prodvar_name / prodvar_options)
        color      - string|{name,image} (opt)
        item_qty   - integer (opt, default: 1)
        item_amount- numeric (opt: UNIT amount for this line)
        items      - array of the same line fields (opt, multi-add)
    */
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
                    'item_qty'    => $json->input('item_qty', 1),
                    'item_amount' => $json->input('item_amount'),
                ];
            } else {
                return response()->json([
                    'success' => false,
                    'message' => 'prod_id or items array is required.',
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
                    $line['color'] ?? null
                );
                if (! $prodvar) {
                    // No variation row at all: OrdersAPI refuses the same way
                    // (a bag line cannot exist without a variation).
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

    // ==========================================
    // DISPLAY CART / ORDERS
    // ==========================================

    /*
        Displaying the bag or the customer's orders
        ----------
        Query Params

        cust_id     - integer (opt, must match the token when sent)
        scope       - 'bag'|'cart' -> bag rows, 'orders' -> placed orders
        bag         - boolean (legacy alias for scope=bag)
        tag_prefix  - 'CART-*' (legacy alias for scope=bag)
        filter      - all|processing|to-claim|claimed|unclaimed|cancelled
        ord_status  - string (opt, exact match)
        ord_id      - integer (opt, single order)
    */
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

            // REQ-ACCESS_LOG-01: reading the customer's cart/orders is logged.
            $this->logView($json, 'cart');

            // A bag belongs to one customer, so an employee never asks for one.
            if (!$employeeView && $this->wantsBagRows($json)) {
                // Self-heal the badge counter while the bag is being read
                // (legacy behaviour: the cart view refreshed cust_cart).
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
                // `status` is the friendly alias the orders list sends.
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
                'data'       => $orders->map(fn ($o) => $this->orderPayload($o))->values()->all(),
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

    // ==========================================
    // SEARCH ORDERS
    // ==========================================

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
                        'items'       => $bags->map(fn (Bag $b) => self::cartItemPayload($b))->values()->all(),
                        'cart_count'  => $bags->count(),
                        'subtotal'    => round((float) $bags->sum(fn (Bag $b) => (float) $b->bag_amount * (int) $b->bag_qty), 2),
                    ],
                ], 200);
            }

            $query = $this->ordersQuery($custId);

            if ($q !== '') {
                // `orders` has no tag column any more: the search runs over
                // the status, the order id and the products that were bought
                // (always through items -> bag -> prodvar -> product).
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
                'data'       => $query->orderByDesc('ord_created')->get()
                    ->map(fn ($o) => $this->orderPayload($o))->values()->all(),
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

    // ==========================================
    // SORT ORDERS
    // ==========================================

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
                // `rating` is a legacy sort key with no live column: it falls
                // back to the creation date, as do unknown keys below.
                'rating' => 'ord_created',
            ];
            $column = $columnMap[$sortBy] ?? 'ord_created';

            if (!$employeeView && $this->wantsBagRows($json)) {
                // The bag is always newest-first (FLOW-BAG-04); the legacy
                // sort call cannot reorder it, it only filters + reports it.
                $bags = self::bagQuery($custId)->orderByDesc('bag_created')->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Cart sorted successfully',
                    'data'    => [
                        'items'      => $bags->map(fn (Bag $b) => self::cartItemPayload($b))->values()->all(),
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
                'data'       => $orders->map(fn ($o) => $this->orderPayload($o))->values()->all(),
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

    // ==========================================
    // REMOVE FROM CART (soft delete)
    // ==========================================

    /*
        Removing one bag line
        ----------
        JSON REQUEST

        bag_id  - integer (req)
        item_id - integer (opt, legacy alias for bag_id)
        ord_id  - integer (opt, legacy alias for bag_id)
    */
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
                    'message' => 'bag_id is required.',
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
                // Already cut into an order: the order flow owns it now.
                return response()->json([
                    'success' => false,
                    'message' => 'Only cart items can be removed.',
                ], 409);
            }

            // FLOW-BAG-05: soft delete, exactly like the POS void precedent.
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

    // ==========================================
    // QTY EDIT (bag row)
    // ==========================================

    /*
        Editing the quantity of one bag line
        ----------
        JSON REQUEST

        bag_id   - integer (req)
        item_id  - integer (opt, legacy alias for bag_id)
        item_qty - integer (req, clamped to prodvar_stock)
    */
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
                    'message' => 'bag_id is required.',
                ], 400);
            }
            if (! $json->has('item_qty')) {
                return response()->json([
                    'success' => false,
                    'message' => 'item_qty is required.',
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
                // Only live stock bounds the line; a sold-out variation keeps
                // its row at 1 piece instead of collapsing to a 0-qty line.
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

    // ==========================================
    // CLEAR THE BAG (FLOW-BAG-07)
    // ==========================================

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

    // ==========================================
    // BAG HELPERS (shared with UserAPI)
    // ==========================================

    /**
     * One cart line payload: the bag row + its variation + the product as
     * ProductsAPI::present() renders it (sizes/colors/stockMatrix/variations).
     */
    public static function cartItemPayload(Bag $bag): array
    {
        $bag->loadMissing(['prodvar.product']);
        $prodvar = $bag->prodvar;
        $product = $prodvar ? $prodvar->product : null;
        $present = $product ? ProductsAPI::present($product) : null;
        $pic     = $prodvar ? $prodvar->prodvar_pic : null;
        $unit    = $product
            ? round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2)
            : round((float) $bag->bag_amount, 2);

        $qty      = (int) $bag->bag_qty;
        $amount   = round((float) $bag->bag_amount, 2);
        $lineTotal = round($qty * $amount, 2);

        return [
            // Canonical bag fields (frontend maps these as `bag-{bag_id}`)
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
            // Cart item shape the frontend consumes: amount is the UNIT price
            // stored on the bag row, line_total = qty * amount (FLOW-BAG-06)
            'qty'            => $qty,
            'amount'         => $amount,
            'line_total'     => $lineTotal,
            'prodvar'        => $prodvar ? $prodvar->toArray() : null,
            // Legacy line aliases. These are response names only - the bag
            // row holds every quantity and amount - and item_amount stays the
            // LINE total those screens document it as.
            'item_id'        => (int) $bag->bag_id,
            'item_qty'       => $qty,
            'item_amount'    => $lineTotal,
            'prod_id'       => $product ? $product->prod_id : null,
            'prod_tag'      => $product ? $product->prod_tag : null,
            'prod_name'     => $product ? $product->prod_name : null,
            'prodvar_name'  => $prodvar ? $prodvar->prodvar_name : null,
            'prodvar_pic'   => $pic,
            'prodvar_stock' => (int) ($prodvar ? $prodvar->prodvar_stock : 0),
            'unit_price'    => $unit,
            'size'          => $prodvar ? $prodvar->prodvar_name : null,
            'color'         => filled($pic) && $prodvar
                ? ['name' => $prodvar->prodvar_name, 'image' => $pic, 'gallery' => [$pic]]
                : null,
            'product'       => $present,
            'available'     => $present ? (bool) $present['available'] : false,
        ];
    }

    /**
     * Every cart response envelope: items (bag_created DESC), cart_count and
     * subtotal = sum(bag_amount * bag_qty) (FLOW-BAG-06).
     */
    public static function cartEnvelope(int $custId): array
    {
        $bags = self::bagQuery($custId)->orderByDesc('bag_created')->get();

        return [
            'items'      => $bags->map(fn (Bag $bag) => self::cartItemPayload($bag))->values()->all(),
            'cart_count' => $bags->count(),
            'subtotal'   => round((float) $bags->sum(
                fn (Bag $bag) => (float) $bag->bag_amount * (int) $bag->bag_qty
            ), 2),
        ];
    }

    /** Live bag rows for one customer (bag_placed = false, bag_deleted IS NULL). */
    public static function bagQuery(int $custId)
    {
        return Bag::with(['prodvar.product'])
            ->where('cust_id', $custId)
            ->whereNull('bag_deleted')
            ->whereRaw('bag_placed = false');
    }

    /** REQ-BAG-03: the number of live bag rows. */
    public static function cartCount(int $custId): int
    {
        return self::bagQuery($custId)->count();
    }

    /**
     * Resolve the variation a cart line points at.
     *
     * Explicit prodvar_id wins; otherwise the size/color sent by the client
     * is matched against prodvar_name and prodvar_options - the same data
     * ProductsAPI::present() rebuilds `prod_sizes` / `prod_colors` /
     * `prod_stock_matrix` from. No match (or no size/color at all) falls back
     * to OrdersAPI::defaultVariation(): the main, else first, live variation.
     *
     * @return Prodvar|null null when the product has no live variation at all
     */
    public static function resolveVariation(Product $product, $prodvarId = null, $size = null, $color = null): ?Prodvar
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

        if ($sizeLabel === '' && $colorName === '') {
            return $vars->first();
        }

        $best = null;
        $bestScore = 0;

        foreach ($vars as $var) {
            $name = trim((string) $var->prodvar_name);
            $opts = self::variationOptions($var);
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
            }

            if ($colorName !== '') {
                if (strcasecmp($name, $colorName) === 0) $score += 3;
                $optionColor = $opts['color'] ?? $opts['colour'] ?? null;
                if ($optionColor !== null && strcasecmp(trim((string) $optionColor), $colorName) === 0) {
                    $score += 4;
                }
            }

            if ($colorImage !== null && filled($var->prodvar_pic)
                && trim((string) $var->prodvar_pic) === trim((string) $colorImage)) {
                $score += 2;
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $var;
            }
        }

        return $best ?? $vars->first();
    }

    /**
     * Create or increment the ONE live bag row for (cust, prodvar).
     * Different variations never merge (REQ-BAG-01).
     *
     * @param float|null $unitAmount UNIT amount for the line (bag_amount)
     */
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
            // The live bag table has no sequence for bag_id (allocating inside
            // the caller's transaction when there is one - see IdAllocator).
            'bag_id'     => IdAllocator::next('bag', 'bag_id'),
            'cust_id'     => $custId,
            'prodvar_id'  => $prodvar->prodvar_id,
            'bag_qty'     => max(1, $qty),
            'bag_amount'  => $unit,
            // DB::raw: a PHP bool binding is sent as an integer and Postgres
            // rejects integer for a boolean column (OrdersAPI precedent).
            'bag_placed'  => DB::raw('false'),
            'bag_created' => now(),
            'bag_deleted' => null,
        ]);
    }

    /** REQ-BAG-03: mirror the live bag line count on the customer row. */
    public static function syncCartCounter(int $custId): void
    {
        $count = self::cartCount($custId);

        $columns = self::counterColumns();
        if ($columns) {
            Customer::where('cust_id', $custId)->update(array_fill_keys($columns, $count));
        }
    }

    /**
     * `customer.cust_bag` (POS badge) and `customer.cust_cart` (legacy) both
     * mirror the live bag count; only the columns the connection actually has
     * are written.
     */
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

    /** prodvar_options ships as a JSON string or (already) an array. */
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

    /** The line's UNIT amount: what the client sent, else the catalog price. */
    private function unitAmount($sent, Product $product, Prodvar $prodvar): float
    {
        if ($sent !== null && $sent !== '') {
            return round((float) $sent, 2);
        }

        return round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2);
    }

    // ==========================================
    // ORDERS HELPERS (legacy CART-* cart retired)
    // ==========================================

    /**
     * The rows an order-list caller is allowed to read.
     *
     * Returns `['custId' => int, 'employee' => false]` for a customer, whose
     * list is always their own (FLOW-ORD_LIST-02); `['custId' => null,
     * 'employee' => true]` for an authenticated employee, who reads the whole
     * store's orders - DOMAIN 3's dashboard KPIs and DOMAIN 5's orders screen
     * both come through here, and GET /products/orders (role:staff) already
     * hands every employee that same list. Anything else is `null` and the
     * caller keeps its original 403.
     */
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

    /**
     * True when the caller asked for bag rows (scope=bag|cart, bag=1 or a
     * legacy CART-* tag_prefix).
     */
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

    /**
     * Every order in scope (FLOW-ORD_LIST-02, ord_created DESC). A customer's
     * scope is their own `cust_id`; an employee's scope is the whole store
     * (`$custId === null` adds no constraint). There is no cart marker on
     * `orders` any more - the bag table IS the cart - so nothing is excluded.
     * Line detail is eager-loaded through items -> bag -> prodvar -> product
     * (the items table has no quantity or product columns) and dispatch info
     * through the live pickup/appointment and delivery/parcel columns.
     * `pickup` is deliberately not joined to its payment: the live pickup
     * table carries no payment key. `customer` is eager-loaded because the
     * admin list renders the nickname/email per row (D3 / REQ-SD-02).
     *
     * FLOW-MANAGE_PRE-02 / REQ-MANAGE_PRE-01: the employee view never shows a
     * register draft - a walk-in order still `processing` whose bag rows are
     * all unplaced is register state, not an order to fulfil, and it used to
     * inflate the "processing" tab and every dashboard KPI.
     */
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
            // A register draft is: no pickup row AND no delivery row (i.e.
            // `Order::isWalkIn()`), still `processing`, and not one bag line
            // placed yet. Everything else stays in the list, so a completed
            // walk-in sale still shows.
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

    /** The bag badge an employee has no meaning for: no customer, no bag. */
    protected function orderScopeCartCount(?int $custId): int
    {
        return $custId === null ? 0 : self::cartCount($custId);
    }

    /**
     * FLOW-ORD_LIST-03 / FLOW-MANAGE_PRE-02: server-side tab buckets. Legacy
     * status spellings are folded in with the DOMAIN 27 vocabulary (POS
     * normalizeStatus) so rows written by older clients still land in a
     * bucket. The spec-literal filter names ("to claim/receive",
     * "claimed/received", "cancel requests") are accepted as aliases of the
     * stored keys, so FLOW-MANAGE_PRE-02's filter list answers as written.
     * An unknown or absent filter changes nothing (backward compatible).
     */
    protected function applyOrderFilter($query, string $filter): void
    {
        $buckets = [
            'processing'      => ['processing', 'to cancel', 'to process', 'cancel requested', 'cancelling', 'return requested'],
            'to-claim'        => ['to claim', 'to receive', 'delivering', 'transit'],
            'claimed'         => ['claimed', 'received', 'delivered', 'completed'],
            'unclaimed'       => ['unclaimed'],
            'cancelled'       => ['cancelled', 'cancel', 'canceled', 'returned', 'refunded'],
            // FLOW-MANAGE_PRE-05: the "cancel requests" filter an employee
            // approves/rejects preorder cancellations through.
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

    /**
     * Render a placed order with all of its relations: status, claiming,
     * created, total and dispatch info (FLOW-ORD_LIST-02/03). Only live
     * columns are read - totals from ord_amount, line detail from
     * items -> bag -> prodvar -> product, dispatch from the appointment and
     * delivery rows.
     */
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

        // REQ-MANAGE_PRE-01: preorder vs walk-in is a first-class field, so
        // the admin list no longer has to infer it from a tag that live rows
        // do not carry (the customer relation ships with it above).
        $walkIn = $order->isWalkIn();
        $payload['is_walk_in']  = $walkIn;
        $payload['walk_in']     = $walkIn;
        $payload['customer']    = $order->customer ? [
            'cust_id'       => $order->customer->cust_id,
            'cust_nickname' => $order->customer->cust_nickname,
            'cust_email'    => $order->customer->cust_email,
            'cust_phone'    => $order->customer->cust_phone,
            'cust_givname'  => $order->customer->cust_givname,
            'cust_surname'  => $order->customer->cust_surname,
        ] : null;
        $payload['customer_name'] = $payload['customer']
            ? trim(($payload['customer']['cust_nickname'] ?: $payload['customer']['cust_givname'])
                . ' ' . $payload['customer']['cust_surname'])
            : null;

        // Totals: ord_amount is authoritative, the bag lines behind the items
        // are the fallback.
        $lineTotal = round((float) array_sum(array_column($items, 'line_total')), 2);
        $ordAmount = $order->getAttribute('ord_amount');
        $amount    = $ordAmount !== null && $ordAmount !== '' ? round((float) $ordAmount, 2) : $lineTotal;

        $payload['ord_amount'] = $amount;
        $payload['amount']     = $amount;
        $payload['total']      = $amount;

        // Payment comes from the parcel that carries it; the order's own
        // pay_reference / pay_received / pay_change already ship above.
        $payment = $order->parcel?->payment ?? null;
        if ($payment) {
            $payload['pay_ref']       = $payment->pay_ref;
            $payload['pay_given']     = (float) $payment->pay_given;
            $payload['pay_due']       = (float) $payment->pay_due;
            $payload['pay_change']    = (float) $payment->pay_change;
            $payload['pay_reference'] = $payment->pay_ref;
        }

        // Pickup: the live appointment slot (start/end), never a single date
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

        // Delivery: live expectation/end columns. The delivery state itself is
        // derived from ord_status + the deliver_* stamps below.
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

    /**
     * Render one order line. The live items table only links an ord_id to a
     * bag row (item_id, ord_id, bag_id, item_created - nothing else), so the
     * quantity, the price and the product are always read through
     * bag -> prodvar -> product.
     */
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
            // Canonical line detail (same vocabulary as the cart item shape)
            'qty'        => $qty,
            'amount'     => $unit,
            'line_total' => $lineTotal,
            // Legacy response aliases the orders screens still read. They are
            // derived from the bag row above - the items table has no quantity
            // or amount columns - and item_amount stays a LINE total, which is
            // what those screens document it as.
            'item_qty'    => $qty,
            'item_amount' => $lineTotal,
            'product'     => $present,
            'available'   => $present ? (bool) ($present['available'] ?? false) : false,
        ];
    }

    // ===== from the Wishlist API file =====
/**
 * DOMAIN 24 (WISHLIST).
 *
 * Removal is a soft delete on `wish_hidden` (REQ-WISHLIST-02 - wish_hidden is
 * the live column, a timestamptz that is NULL while the row is visible), the
 * display only ever shows rows with wish_hidden IS NULL ordered wish_created
 * DESC (FLOW-WISHLIST-03), and re-adding a hidden row resurrects it instead
 * of inserting a duplicate.
 *
 * "Transfer to order" no longer builds an orders-CART row: it creates a live
 * bag line through UserAPI (one row per product variation), so the wishlist
 * item always lands in the bag the checkout flow reads.
 */

    // ===== from the Wishlist API file =====

    /*
        Adding a product to the wishlist
        ----------
        JSON REQUEST

        cust_id - integer (req)
        prod_id - integer or string prod_tag (req)
        item_qty / item_amount - accepted for legacy clients, the live
            wishlist table has no quantity columns and ignores them
    */
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

            // One row per (cust, prod): a visible row is skipped, a hidden
            // (wish_hidden) row is resurrected - never a duplicate insert.
            $existing = Wishlist::where('cust_id', $custId)
                ->where('prod_id', $resolvedProdId)
                ->first();

            $created = false;
            if ($existing && $existing->wish_hidden === null) {
                $message = 'Item already in wishlist';
            } else {
                if ($existing) {
                    // Resurrect the hidden row (query builder: the wishlist
                    // composite key is not a Eloquent primary key everywhere).
                    Wishlist::where('cust_id', $custId)
                        ->where('prod_id', $resolvedProdId)
                        ->update([
                            'wish_hidden' => null,
                            'wish_created' => now(),
                        ]);
                } else {
                    Wishlist::create([
                        // No sequence for wish_id on the live table.
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

    /*
        Moving a wishlist item into the bag (FLOW-WISHLIST-06)
        ----------
        JSON REQUEST

        cust_id    - integer (req)
        prod_id    - integer or string prod_tag (req)
        item_qty   - integer (opt, default: 1)
        prodvar_id - integer (opt, explicit variation)
        size       - string (opt)
        color      - string|{name,image} (opt)
        item_amount- numeric (opt, UNIT amount)
    */
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

            // Same variation resolution as POST /cart/add.
            $prodvar = UserAPI::resolveVariation(
                $product,
                $json->input('prodvar_id'),
                $json->input('size'),
                $json->input('color')
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

            // Wishlist and bag membership stay independent: the saved row is
            // kept, the bag gains one live line for this variation.
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

    /*
        Displaying the wishlist
        ----------
        JSON REQUEST

        cust_id - integer (req)
    */
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

            // REQ-ACCESS_LOG-01: reading the customer's wishlist is logged.
            $this->logView($json, 'wishlist');

            // FLOW-WISHLIST-03: hidden rows stay hidden, newest first.
            // Unavailable rows REMAIN in the list (FLOW-WISHLIST-07): each
            // payload carries `available` so the frontend can label them.
            $items = Wishlist::with('product')
                ->where('cust_id', $custId)
                ->whereNull('wish_hidden')
                ->orderByDesc('wish_created')
                ->get();

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

    /*
        Removing a wishlist item (soft delete - REQ-WISHLIST-02)
        ----------
        JSON REQUEST

        cust_id - integer (req)
        prod_id - integer or string prod_tag (req)
    */
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

            // REQ-WISHLIST-02: stamp wish_hidden, never ->delete().
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

    /*
        Wishlist row lookup by id or tag
        ----------
        The live wishlist has no quantity columns: item_qty / item_amount are
        accepted and ignored so older clients keep getting a 200.
    */
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

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * One wishlist row: the stored fields, the presented product and the
     * FLOW-WISHLIST-07 `available` flag (product exists, not disabled, not
     * deleted). Unavailable rows are still returned.
     */
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

    /** cust_wishlist mirrors the number of live (wish_hidden IS NULL) rows. */
    protected function syncWishlistCounter(int $custId): void
    {
        $count = Wishlist::where('cust_id', $custId)->whereNull('wish_hidden')->count();

        Customer::where('cust_id', $custId)->update(['cust_wishlist' => $count]);
    }

    /** `prod_id` may also arrive as a `prod_tag`; a bad key never hits SQL. */
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
            /*
                CUSTOMER SIGNUP (DOMAIN 17)
                ----------
                JSON REQUEST

                email       - string (req - Bicol University address for BUños)
                phone       - string (req - 10 to 11 digits)
                password    - string (req)
                givname     - string (req)
                surname     - string (req)
                type        - string (req - "BUeño" | "guest")
                cust_categ  - string (req for BUños: student | alumni | faculty)
                cust_college- string (req for BUños)
                cust_dept   - string (req for BUños)
                pronoun     - string (opt)
                bday        - string (opt)
                address     - string (opt)
                callcode    - string (opt)
                backup_phone- string (opt)
                backup_email- string (opt)

                FLOW-CUST_SIGNUP-05: the account is created but NOT opened -
                no session token is returned. Only a cleared phone OTP
                finalizes it, so `cust_login_active` stays NULL (a token with
                no matching nonce is rejected by ApiToken::parse) and a signed
                `challenge` carries the customer to /verify-otp.
            */

            // Validate signup input
            $validator = (new DatabaseAPI())->customerSignup($json);
            if ($validator) return $validator;

            $email    = strtolower(trim((string) $json->input('email')));
            $phone    = (string) $json->input('phone');
            $password = (string) $json->input('password');

            // FLOW-CUST_SIGNUP-02: cust_type is either "BUeño" or "guest".
            $guest = $this->normalizeSignupType($json->input('type')) !== 'bueno';

            // FLOW-CUST_SIGNUP-03 / FLOW-CUST_SIGNUP-04.
            $categ   = $guest ? null : (strtolower((string) $json->input('cust_categ')) ?: 'student');
            $college = $guest ? null : (trim((string) $json->input('cust_college')) ?: null);
            $dept    = $guest ? null : (trim((string) $json->input('cust_dept')) ?: null);

            // FLOW-CUST_SIGNUP-06: the email address may not be registered.
            if ($email !== '' && Customer::where('cust_email', $email)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'That email address is already registered.'
                ], 409);
            }

            // FLOW-CUST_SIGNUP-07 (uniqueness half): one account per number.
            if (Customer::where('cust_phone', $phone)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'That phone number is already registered.'
                ], 409);
            }

            // Inserts to database using Models
            try {
                $customer = Customer::create(
                    $this->signupAttributes($json, $email, $phone, $password, $guest, $categ, $college, $dept)
                );

                // FLOW-CUST_SIGNUP-05 / REQ-CUST_SIGNUP-04: the six-digit
                // code lands in the new account's own notification inbox,
                // and the signed challenge is what the verify screen redeems.
                [$code, $error] = $this->issueOtpCode($customer, 'signup');

                // REQ-CUST_LOGOUT-03 / FLOW-ACCESS_LOG-01: the registration
                // itself is an authentication action.
                $this->logCustomer((int) $customer->cust_id, 'authentication',
                    'POST /api/auth/cust_signup - account created, phone OTP pending');

                // FLOW-CUST_SIGNUP-05: the row exists but is NOT finalized, so
                // the signup stays flagged for a week - a login inside that
                // window resumes this OTP challenge instead of opening a
                // session, and clearing the flag is what finalizes the signup.
                Cache::put(
                    $this->signupPendingKey((int) $customer->cust_id),
                    ['email' => $email, 'phone' => $phone, 'ts' => now()->timestamp],
                    now()->addDays(7)
                );

                // JSON SUCCESS (account pending, no session yet)
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
                        'expires_in'   => self::OTP_TTL_MINUTES * 60,
                        'cust_id'      => (int) $customer->cust_id,
                    ],
                ], 201);

            } catch (\Exception $e) {
                // JSON ERROR
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }


        /**
         * Builds the CUSTOMER row for the schema that is actually connected:
         * the live system-new.docx columns when they exist, the pre-migration
         * columns otherwise (the legacy fixtures used by the test suite).
         * No column outside either generation is ever written.
         */
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
                // The live customer table carries no sequence, so the key is
                // handed out by the shared allocator (see IdAllocator).
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
                    // FLOW-CUST_SIGNUP-03 / FLOW-CUST_SIGNUP-04
                    'cust_categ'               => $categ,
                    'cust_dept'                => $dept,
                    'cust_backup_phone'        => trim((string) ($json->input('backup_phone') ?: $json->input('backupphone'))) ?: null,
                    'cust_backup_email'        => strtolower(trim((string) ($json->input('backup_email') ?: $json->input('backupemail')))) ?: null,
                    'cust_backup_ques'         => null,
                    'cust_backup_answer'       => null,
                    // NOT NULL on the live system-new.docx schema with the
                    // default "/", so the marker is written explicitly - an
                    // explicit NULL here would abort the insert (23502).
                    'cust_backup_code'         => '/',
                    'cust_darkmode'            => false,
                    'cust_deleted'             => null,
                    'cust_suspended'           => null,
                    // FLOW-CUST_SIGNUP-05: no live session until the OTP clears
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

            // Legacy (pre-migration) table shape.
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
            /*
                EMPLOYEE ENROLLMENT (DOMAIN 6)
                ----------
                JSON REQUEST

                email - string (req - must be a Bicol University address)
                phone - string (req)
                surname - string (req)
                givname - string (req)
                categ / type - string (opt: staff | admin | super admin)
                midname, suffix, studnum, pronoun, birthday, brgy, city,
                province, country, callcode, instore - optional details

                FLOW-EMP_ENROLL-02 collects exactly the five required values,
                FLOW-EMP_ENROLL-03 validates the university domain,
                FLOW-EMP_ENROLL-04 generates and emails the temporary
                password, FLOW-EMP_ENROLL-05 opens the account as "active" and
                preschedules it as "available", FLOW-EMP_ENROLL-06 confirms
                back to the super admin and FLOW-EMP_ENROLL-07 writes the
                enrollment - failures included (REQ-EMP_ENROLL-05) - to the
                access log.
            */

            // Validate signup input
            $validator = (new DatabaseAPI())->employeeSignup($json);
            if ($validator) {
                // REQ-EMP_ENROLL-05: a rejected attempt is an attempt too.
                $this->logEnrollment($json, 'FAILED', $validator->getData()['message'] ?? 'rejected');

                return $validator;
            }

            $email = strtolower(trim((string) $json->input('email')));
            $temporaryPassword = EmployeePassword::generateTemporary(20);
            $type = $this->employeeCategory($json);

            if (Employee::where('emp_email', $email)->exists()) {
                // REQ-EMP_ENROLL-04: duplicates are rejected with a clear error
                // (and the attempt still lands in the log).
                $this->logEnrollment($json, 'FAILED', 'duplicate email ' . $email);

                return response()->json([
                    'success' => false,
                    'message' => 'Email already exists',
                ], 409);
            }

            try {
                $attributes = [
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
                    'emp_phone' => $json->input('phone'),
                    'emp_email' => $email,
                    // FLOW-EMP_ENROLL-02: the initial category. The live table
                    // spells it `emp_categ` (lowercase, rule 32); the fixture
                    // still carries the legacy `emp_type` alias.
                    'emp_categ' => $type,
                    'emp_type' => strtoupper($type),
                    // existingColumns() keeps only the spelling the connected
                    // schema carries (emp_instore on the fixture, emp_present
                    // on live), so the flag lands in the real column.
                    'emp_instore' => (bool) $json->input('instore', false),
                    'emp_present' => (bool) $json->input('instore', false),
                    // FLOW-EMP_ENROLL-05: the account opens active, so both
                    // blocking stamps stay empty until somebody suspends it.
                    'emp_suspended' => null,
                    'emp_deleted' => null,
                ];

                // The connected schema decides which of those columns exist:
                // the live employee table carries the system-new.docx set
                // (no emp_birthday / emp_brgy / emp_type ...), while the
                // pre-migration fixture phpunit runs on still declares its own
                // NOT NULL columns. forceCreate writes exactly the intersection
                // - the model's fillable list would silently drop the fixture's
                // required columns and fail the insert - and every key above
                // comes from this whitelist, never straight from the request.
                $employee = Employee::forceCreate(
                    $this->existingColumns('employee', $attributes)
                );

                // FLOW-EMP_ENROLL-05 / REQ-EMP_ENROLL-06: the new account is
                // prescheduled as available straight away (full availability
                // for the next seven days clears the 180-minute weekly floor).
                $this->prescheduleNewEmployee((int) $employee->emp_id);

                // FLOW-EMP_ENROLL-04: the generated password goes to the
                // employee's Bicol University mailbox as well as back to the
                // super admin. MAIL_MAILER=log keeps this best-effort - a mail
                // transport that is not configured must not fail the signup.
                $this->mailTemporaryPassword($employee, $temporaryPassword);

                // REQ-UM-04 / FLOW-EMP_ENROLL-07: registrations are logged
                // with the responsible super admin and the timestamp, like
                // every other user management action.
                $by = $json->user('api');
                EmpLog::forceCreate(
                    $this->existingColumns('emplog', [
                        'emplog_id'      => $this->nextId('emplog', 'emplog_id'),
                        'emp_id'         => $employee->emp_id,
                        'emplog_created' => now(),
                        'emplog_access'  => 'edit',
                        'emplog_endpoint' => 'POST /api/auth/emp_signup',
                        // Legacy fixture columns (dropped where they are absent).
                        'emplog_action'  => 'REGISTER',
                        'emplog_desc'    => 'Registered employee ' . $employee->emp_id . ' ('
                            . $employee->emp_givname . ' ' . $employee->emp_surname . ') as '
                            . $type . ' by super admin '
                            . ($by instanceof Employee ? $by->emp_id : 'unknown')
                            . '. Reason: new employee onboarding.',
                    ])
                );

                // FLOW-EMP_ENROLL-07: the same event, filed under the id of
                // the super admin who performed it.
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
                // REQ-EMP_ENROLL-05: failures are logged too.
                $this->logEnrollment($json, 'FAILED', $email . ' - ' . $e->getMessage());

                // JSON ERROR
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }


        // The super-admin test itself lives on the base Controller
        // (`protected isSuperAdmin($user)`) and delegates to
        // Employee::isSuperAdmin(). Redeclaring it here - with a narrower
        // visibility *and* a narrower parameter type - is a PHP fatal error
        // that php -l cannot see, and it 500'd /auth/emp_login, which the
        // portal then surfaced as "Cannot reach the server".

        /**
         * FLOW-EMP_ENROLL-02 - the initial category posted by the enrolment
         * form, folded onto rule 32's vocabulary ("staff", "admin", "super
         * admin"). `categ` is the system-new spelling, `type` the legacy alias.
         */
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


        /**
         * FLOW-EMP_ENROLL-05 / REQ-EMP_ENROLL-06 - a new employee is
         * prescheduled as "available" the moment the account is opened, so
         * their first week carries full availability (one unbroken block from
         * now, well past the 180-minute weekly floor of rule 46).
         *
         * The live connection owns a `schedules` table; the pre-migration
         * fixture does not, so the write is skipped there rather than failing
         * the enrollment.
         */
        private function prescheduleNewEmployee(int $empId): void
        {
            try {
                if (! Schema::hasTable('schedules')) {
                    return;
                }

                $start = now();
                Schedule::forceCreate([
                    'sched_id'         => $this->nextId('schedules', 'sched_id'),
                    'emp_id'           => $empId,
                    'sched_time_start' => $start,
                    'sched_time_end'   => $start->copy()->addDays(7),
                    'sched_created'    => now(),
                    // null = prescheduled / available (see the Schedule model).
                    'sched_disabled'   => null,
                ]);
            } catch (\Throwable $e) {
                // Availability bookkeeping must never undo an enrollment.
            }
        }


        /**
         * FLOW-EMP_ENROLL-04 - hands the generated password to the employee's
         * Bicol University mailbox. Best-effort by design: with MAIL_MAILER=log
         * (or an unreachable transport) the message is written to the mail log
         * and the super admin still receives the password in the response.
         */
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
                // Never fail enrollment because of a mail transport.
            }
        }


        /**
         * FLOW-EMP_ENROLL-07 / REQ-EMP_ENROLL-05 - one immutable emplog row for
         * the enrollment itself, filed under the id of the super admin who
         * performed it (successes and failures alike).
         */
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

            /*
                DOMAIN 15 / FLOW-EMP_SET-03 (and its DOMAIN 29 twin).

                system-new.docx SCHEMA keeps backup contacts in the single
                `*_backup_phone` / `*_backup_email` column pair - there is no
                `*_backupcallcode` column any more - so the country code the
                form still sends is folded into the stored number instead of
                being written to a column that does not exist. An empty value
                simply leaves the stored contact untouched, exactly as before.
            */
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

            // REQ-EMP_SET-02 / REQ-CUST_SET-02: a settings change is logged
            // with the account id and the timestamp it happened at.
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


        /**
         * Folds a country code onto a backup phone number so the value that
         * lands in `*_backup_phone` is one international number:
         *   ("9123456789", "+63") -> "+639123456789"
         *   ("09123456789", "+63") -> "+639123456789"
         * An already international number (or one without a code) is kept as
         * the caller wrote it.
         */
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

            // DOMAIN 29 / FLOW-CUST_SET-03: a customer always proves the
            // change with a phone OTP before anything is written.
            //
            // REQ-EMP_SET-01 - FLOW-EMP_SET-02 orders the form as "current
            // password, then new password twice", so the current password is
            // answered FIRST: raising the OTP challenge before the password
            // has even been compared would hide "Current password is
            // incorrect." behind a verification the caller never asked for.
            $user = $json->user();
            $passwordField = $user instanceof Customer ? 'cust_password' : 'emp_password';
            $changedField = $user instanceof Customer ? 'cust_cred_changed' : 'emp_cred_changed';

            if (! Hash::check($json->input('current_password'), $user->{$passwordField})) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current password is incorrect.',
                ], 422);
            }

            $gate = $this->otpGate($json, 'password_change');
            if ($gate) {
                return $gate;
            }

            // FLOW-EMP_SET-02 - the new password is entered twice. The form
            // sends the second entry as `new_password_confirmation`; when it
            // is present it must match exactly, so a mismatched pair can
            // never reach the database.
            if ($json->has('new_password_confirmation')
                && (string) $json->input('new_password_confirmation') !== (string) $json->input('new_password')) {
                return response()->json([
                    'success' => false,
                    'message' => 'New password confirmation does not match.',
                ], 422);
            }

            // REQ-SETUP-03 - a super admin credential has to meet the store's
            // security standard: minimum length and complexity. The same bar
            // EmployeePassword::generateTemporary() already clears for the
            // temporary password issued at enrollment (REQ-EMP_ENROLL-03), so
            // every super admin password in the system is produced by one
            // shared rule. Only super admins are held to it; customers and
            // other employees keep the validator's own 8-character floor.
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
                /*
                    REQ-EMP_PROF-01 - "Employee email addresses must not be
                    editable by regular staff members."

                    This endpoint only ever rewrites the account that owns the
                    bearer token, so the category of that account is the whole
                    test: a staff member may change phone, pronoun and password
                    here, but never the login identity itself. An admin or
                    super admin keeps the right (rules 36-37 reserve the
                    category itself for super admins).
                */
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

                        // Rule 27: a Bicol University email belongs to only
                        // one employee (and never to a customer either).
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
            // The credential-changed stamp only exists where the schema has
            // the column; writing it blindly would be dropped by mass
            // assignment (or fail outright on a schema without it).
            if (\Schema::hasColumn($user->getTable(), $changedField)) {
                $update[$changedField] = now();
            }
            $user->update($update);

            if ($user instanceof Employee) {
                /*
                    FLOW-EMP_LOGOUT-06 / REQ-EMP_LOGOUT-03 - a password change
                    ends every session of the account at once: employee tokens
                    carry the `emp_login_active` nonce, so clearing it revokes
                    the token that carried this request and every other device
                    too (ApiToken::parse refuses a token whose nonce no longer
                    matches the column).
                */
                $user->emp_login_active = null;
                $user->save();
            } else {
                $user->tokens()->delete();
            }

            // The verification covers exactly this one change (FLOW-CUST_SET-06).
            $this->consumeOtp($json, 'password_change');

            // REQ-CUST_SET-02 / REQ-EMP_SET-02: every setting change is logged.
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


    // ===== from the Settings API file =====
/**
     * DOMAIN 1 / DOMAIN 15 / DOMAIN 29.
     *
     * There is no `settings` table (SPEC section 4): system-wide values live in
     * SystemSettings (storage/app/system-settings.json) and every per-account
     * preference lives on the caller's own customer / employee row.
     */

    // ===== from the Settings API file =====

    // ==========================================
    // PROFILE PAYLOAD MAPPING (legacy input -> live columns)
    // ==========================================

    /** Validation for the mapped customer payload (new column names). */
    private const CUSTOMER_PROFILE_RULES = [
        'cust_givname' => 'sometimes|string|max:100',
        'cust_surname' => 'sometimes|string|max:100',
        'cust_pronoun' => 'sometimes|string|max:50',
        'cust_bday' => 'sometimes|nullable|date',
        // REQ-CUST_PROF-03: several addresses share this single column, so it
        // is allowed to grow far past the legacy 255-character form limit.
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

    /**
     * REQ-EMP_PROF-03 / REQ-CUST_PROF-04: an avatar is at most 2 MB - the
     * same ceiling ProductsAPI::uploadImage enforces on a real file upload.
     */
    private const MAX_AVATAR_BYTES = 2048 * 1024;

    /** Validation for the mapped employee payload (new column names). */
    private const EMPLOYEE_PROFILE_RULES = [
        'emp_givname' => 'sometimes|string|max:100',
        'emp_surname' => 'sometimes|string|max:100',
        'emp_pronoun' => 'sometimes|string|max:50',
        'emp_callcode' => 'sometimes|regex:/^\+?[0-9]{1,4}$/',
        'emp_phone' => 'sometimes|nullable|regex:/^[0-9]{10,11}$/',
        'emp_email' => 'sometimes|nullable|email:rfc',
        'emp_avatar' => 'sometimes|nullable|string',
        'emp_backup_phone' => 'sometimes|nullable|string|max:40',
        'emp_backup_email' => 'sometimes|nullable|email:rfc',
        // Whichever spelling the connected schema stores the flag under
        // (see Employee::availabilityColumn()).
        'emp_present' => 'sometimes|boolean',
        'emp_instore' => 'sometimes|boolean',
        'emp_darkmode' => 'sometimes|boolean',
        'emp_notif_appointremind' => 'sometimes|nullable|integer|min:0|max:1440',
        'emp_notif_email' => 'sometimes|boolean',
    ];

        /** Preference columns that belong to a customer row (D15/D29). */
        private const CUSTOMER_PREFS = [
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


        /** Preference columns that belong to an employee row (D15/D29). */
        private const EMPLOYEE_PREFS = [
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


        /** True when $key is one of the personal preference columns above. */
        private function isPreferenceKey(string $key): bool
        {
            foreach ([self::CUSTOMER_PREFS, self::EMPLOYEE_PREFS] as $map) {
                // Bare aliases the frontend sends: `darkmode`, `notif_email`,
                // `notif_appointremind`, `backup_phone`, ...
                if (array_key_exists($key, $map)) {
                    return true;
                }
                // Canonical column names: `emp_darkmode`, `cust_backup_email`, ...
                if (in_array($key, $map, true)) {
                    return true;
                }
                // Prefixed aliases: `cust_darkmode`, `emp_notif_email`, ...
                foreach ($map as $bare => $column) {
                    if ($key === $column || str_ends_with($key, '_' . $bare)) {
                        return true;
                    }
                }
            }

            return false;
        }


        /** Coerce a preference payload value into the row column type. */
        private function castPreference(string $column, $value)
        {
            if (str_ends_with($column, '_darkmode') || str_ends_with($column, '_notif_email') || str_ends_with($column, '_notif_prod')) {
                return filter_var($value, FILTER_VALIDATE_BOOLEAN);
            }
            if (str_ends_with($column, '_notif_appointremind')) {
                return (int) $value;
            }
            // A contact column stores its contacts as one ';'-separated string.
            if (str_ends_with($column, '_backup_phone') || str_ends_with($column, '_backup_email')) {
                return is_array($value)
                    ? implode('; ', array_values(array_filter(array_map('trim', $value))))
                    : $value;
            }

            return $value;
        }


        /**
         * DOMAIN 29 value rules, checked before anything is written:
         * reminders are whole minutes <= one day (REQ-CUST_SET-01), switches
         * are booleans, and backup contacts are well-formed lists.
         * Returns a 422 response, or null when every value is acceptable.
         */
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


        /** A contact column may hold several contacts; ';' or ',' separates them. */
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


        // The shared Controller::fail() answers 422 for a preference that
        // failed its value rule; the status is passed explicitly at each call.


        /** The caller's own preference columns (prefixed + bare aliases). */
        private function callerPreferences($user): array
        {
            if (!$user instanceof Customer && !$user instanceof Employee) {
                return [];
            }

            $map = $user instanceof Customer ? self::CUSTOMER_PREFS : self::EMPLOYEE_PREFS;
            $prefs = [];
            foreach ($map as $bare => $column) {
                $value = $user->getAttribute($column);
                if ($value === null) {
                    continue;
                }
                $prefs[$column] = $value;   // canonical new name
                $prefs[$bare]    = $value;   // legacy alias the frontend reads
            }

            return $prefs;
        }


        /** System settings + caller prefs + the FLOW-SETUP-01 readiness flag. */
        private function payload($user): array
        {
            // SystemAPI owns the system-wide settings document (rule 76), so
            // the system half of the payload is read through it instead of
            // being duplicated here.
            $settings = (new SystemAPI())->systemSettingsPayload();

            return array_merge($settings, $this->callerPreferences($user));
        }


        /*
            Displaying settings
            ----------
            JSON REQUEST (No required params)

            Returns the system-wide settings (SystemSettings JSON document),
            the caller's own preference columns and `setup_complete`.
        */
        public function displaySettings(Request $json)
        {
            try {
                $user = $json->user('api');
                $settings = $this->payload($user);

                // D32 - reading settings is a 'view' action.
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
                    'message' => 'Failed to display settings',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }


        /*
            Updating settings
            ----------
            JSON REQUEST

            settings - array (req: key-value dictionary)

            Personal preference keys are written to the caller's own row; every
            other key is system-wide and needs a super admin (D1).
        */
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

                // Split the dictionary: personal preferences vs system keys.
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

                // D1: system-wide values are super-admin only.
                if (!empty($system) && !$this->isSuperAdmin($user)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Only super admin employees may perform this action'
                    ], 403);
                }

                $endpoint = 'PUT /api/settings/update';

                // Personal preferences -> the caller's own row (D15/D29).
                $appliedPreferences = [];
                if (!empty($preferences)) {
                    $map    = $user instanceof Customer ? self::CUSTOMER_PREFS : self::EMPLOYEE_PREFS;
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
                            // `cust_darkmode` / `emp_backup_phone` style keys
                            foreach ($map as $bare => $candidate) {
                                if ($key === $candidate || str_ends_with($key, '_' . $bare)) {
                                    $column = $candidate;
                                    break;
                                }
                            }
                        }
                        if ($column !== null) {
                            // A preference key whose column is not part of this
                            // schema (e.g. `emp_notif_prod` on the employee row,
                            // which system-new.docx SCHEMA does not list) is
                            // skipped instead of producing invalid SQL - and it
                            // is NOT counted as a change below, because nothing
                            // was written for it.
                            if (! \Schema::hasColumn($table, $column)) {
                                continue;
                            }
                            $updates[$column] = $this->castPreference($column, $value);
                            $appliedPreferences[] = (string) $key;
                        }
                    }

                    // FLOW-CUST_SET-06 / REQ-CUST_SET-02: backup contacts are
                    // sensitive, so a customer must clear the phone OTP first.
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
                        // One verification covers exactly one saved change.
                        $this->consumeOtp($json, 'backup_contacts');
                    }
                }

                /*
                    System-wide values -> SystemSettings (D1).

                    SystemAPI owns the system settings document (rule 76), so
                    the validate-before-write and the storage write are
                    delegated to SystemAPI::applySystemSettings(); a returned
                    response is the error envelope to send back as-is.
                */
                $systemProblem = (new SystemAPI())->applySystemSettings($system);
                if ($systemProblem !== null) {
                    return $systemProblem;
                }

                // D32 / REQ-CUST_SET-04 - changing settings is an 'edit' action,
                // recorded with the preference that actually changed.
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
                    'message' => 'Failed to update settings',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }


        /*
            Displaying notifications for an account (inbox)
            ----------
            JSON REQUEST / Query Params

            recipient_type - string (req: customer | employee)
            recipient_id - integer (req for employees, resolved from the
                            token for customers)
        */
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

                // D31: unread first, then priority first, then *_created DESC.
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

                // D32 - reading your own inbox is a 'view' action.
                $this->logActor($json, 'view', 'GET /api/notif/display');

                return response()->json([
                    'success' => true,
                    'message' => 'Notifications retrieved successfully',
                    'data'    => $notifications
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display notifications',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }


        /*
            Updating notification status (mark as read)
            ----------
            JSON REQUEST

            notif_id - integer (req)
            recipient_type - string (req: customer | employee)
        */
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

                // D31 marking read sets *_read = now(); D32 logs it as an edit.
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


    /*
        Reading the caller's own account row
        ----------
        GET /api/accounts/me - no body needed
    */
    public function displayMyAccount(Request $json)
    {
        $user = $json->user('api');

        if (! $user instanceof Customer && ! $user instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Only signed-in accounts may read this endpoint',
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
                'message' => 'Failed to retrieve account',
                'error' => $e->getMessage(),
            ], 500);
        }
    }


    /*
        Updating account details (REQ-APC-02 profile form)
        ----------
        JSON REQUEST

        user_id - integer (req)
        account_type - string (req: customer | employee)
        (attributes to update - new column names first, legacy aliases accepted)
    */
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
                if (! $actor instanceof Employee || ((int) $actor->getKey() !== $userId && ! $this->isSuperAdmin($actor))) {
                    return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
                }
                $user = Employee::findOrFail($userId);
            }

            [$payload, $error] = $isCustomer
                ? $this->mapCustomerProfile($user, $json)
                : $this->mapEmployeeProfile($user, $json);

            if ($error !== null) {
                return $error;
            }

            /*
                REQ-EMP_PROF-01 - "Employee email addresses must not be
                editable by regular staff members."

                The form already renders the field read-only for a staff
                member, but a crafted request must land on the same rule, so
                the server checks the CALLER's category. Sending the address
                back unchanged is treated as the no-op a round-tripped form
                produces (the value is simply dropped), while an actual change
                is refused. Admins and super admins keep the right.
            */
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

            $rules = $isCustomer ? self::CUSTOMER_PROFILE_RULES : self::EMPLOYEE_PROFILE_RULES;
            $validator = Validator::make($payload, $rules);
            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => $validator->errors()->first(),
                    'errors' => $validator->errors(),
                ], 422);
            }

            // Unique login identifiers may only be taken by ANOTHER row
            // (EDGE-UNIQ-01): a profile save that re-sends the current value
            // is never a conflict.
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

            // REQ-SS-02: availability locks at the exact start of the
            // employee's duty block, so the change is checked before it is
            // written. Super admins may override at any time.
            $availability = Employee::availabilityColumn();
            if (! $isCustomer && array_key_exists($availability, $payload)) {
                $blocked = $this->availabilityDeadlineBlocked($json, (int) $user->emp_id);
                if ($blocked) return $blocked;
            }

            $user->update($payload);

            // REQ-SS-03 / REQ-AB-03: an availability change is cross-checked
            // against open bookings, and customers still holding one are told
            // to reschedule when the in-store minimum is no longer met.
            if (! $isCustomer && array_key_exists($availability, $payload)) {
                $this->notifyStaffShortage();
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
                'message' => 'Failed to update account details',
                'error' => $e->getMessage(),
            ], 500);
        }
    }


    /**
     * Maps the legacy / new customer profile payload onto live columns.
     * Dropped (no column in the schema): cust_username, cust_campus,
     * cust_course (mapped to cust_dept), cust_year, cust_cred_changed.
     *
     * @return array{0: array<string, mixed>, 1: \Illuminate\Http\JsonResponse|null}
     */
    private function mapCustomerProfile(Customer $user, Request $json): array
    {
        $payload = [];

        // Display name: legacy cust_nickname splits into givname + surname
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

        // Birthday: cust_bday (new) or cust_birthday (legacy alias)
        if ($json->has('cust_bday')) {
            $payload['cust_bday'] = $json->input('cust_bday');
        } elseif ($json->has('cust_birthday')) {
            $payload['cust_bday'] = $json->input('cust_birthday');
        }

        // Address: REQ-CUST_PROF-03 allows several delivery addresses per
        // customer. The schema keeps them in the single cust_address column,
        // so the list round-trips as one ' | '-separated string; the legacy
        // four-part payload still rebuilds a single address.
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

        // Department: cust_dept (new) with cust_course / dept as aliases
        if ($json->has('cust_dept')) {
            $payload['cust_dept'] = $json->input('cust_dept');
        } elseif ($json->has('cust_course') || $json->has('dept')) {
            $payload['cust_dept'] = $json->input('cust_course') ?: $json->input('dept');
        }

        if ($json->has('cust_email')) {
            $email = mb_strtolower(trim((string) $json->input('cust_email')));
            // REQ-CUST_PROF-01: a customer can never edit their own email
            // address. The stored value is simply kept, so a profile form
            // that round-trips a read-only field still saves cleanly.
            if ($email === '' || $email === mb_strtolower(trim((string) $user->cust_email))) {
                $payload['cust_email'] = $user->cust_email;
            }
        }
        // REQ-CUST_PROF-01: cust_type is system-assigned (rules 17-18) and is
        // never written from a profile save.
        if ($json->has('cust_phone')) {
            // cust_phone is NOT NULL: an empty value means "leave as-is"
            $phone = $this->normalizePhone((string) $json->input('cust_phone'));
            if ($phone !== '') {
                $payload['cust_phone'] = $phone;
            }
        }

        // Photo: cust_avatar (new) or cust_photo (legacy alias).
        // REQ-CUST_PROF-04: the format is checked here as well as at upload.
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

        // Backup contact: two legacy keys fold into one column
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


    /**
     * Maps the legacy / new employee profile payload onto live columns.
     * Dropped (no column in the schema): emp_midname, emp_suffix,
     * emp_studnum, emp_college, emp_program, emp_year, emp_bloc,
     * emp_birthday, emp_brgy/city/province/country, emp_backupcallcode,
     * emp_photo (-> emp_avatar), emp_type (-> emp_categ, managed only by
     * PUT /accounts/type), emp_cred_changed.
     *
     * @return array{0: array<string, mixed>, 1: \Illuminate\Http\JsonResponse|null}
     */
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
            // emp_email is NOT NULL + UNIQUE: an empty value means "keep"
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

        // emp_photo (legacy) -> emp_avatar (live)
        //
        // REQ-EMP_PROF-03: "Employee avatars must be validated for format and
        // file size before upload." The profile screen posts the picture
        // straight to this endpoint as a data URL, bypassing ProductsAPI, so the
        // identical PNG/JPEG/GIF/WebP + 2 MB rules are applied here as well.
        // A value that round-trips untouched from the stored row is a no-op
        // and is never re-judged, so an already-saved avatar can never block
        // an unrelated profile edit.
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
                if ($bytes !== null && $bytes > self::MAX_AVATAR_BYTES) {
                    return [$payload, response()->json([
                        'success' => false,
                        'message' => 'Profile avatars must be 2 MB or smaller.',
                        'code' => 'AVATAR_TOO_LARGE',
                    ], 422)];
                }
            }

            $payload['emp_avatar'] = $avatar !== '' ? $avatar : null;
        }

        // emp_instore (legacy) / emp_present (live): write whichever column
        // the connected schema actually carries.
        $availability = Employee::availabilityColumn();
        if ($json->has('emp_present')) {
            $payload[$availability] = (bool) $json->input('emp_present');
        } elseif ($json->has('emp_instore')) {
            $payload[$availability] = (bool) $json->input('emp_instore');
        }

        // Backup contact: legacy emp_backupphone / emp_backupemail keys
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


    /** Rebuilds cust_address from whichever parts the payload carries. */
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


    /** 422 response for a rejected address list (REQ-CUST_PROF-03). */
    private function addressError(string $message): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message], 422);
    }


    /**
     * REQ-CUST_PROF-04: profile photos must be PNG/JPEG/GIF/WebP. A value may
     * be a data URI carrying one of those types, a URL ending in an allowed
     * extension, or a bare extension token.
     */
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


    /**
     * REQ-EMP_PROF-03: the decoded payload size of an avatar.
     *
     * A data URI carries the bytes directly, so they are decoded and counted;
     * a hosted URL or an already-stored path has no bytes to measure here and
     * returns null (the picture was sized when it was uploaded, and
     * ProductsAPI::uploadImage already held it to the same ceiling).
     */
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
