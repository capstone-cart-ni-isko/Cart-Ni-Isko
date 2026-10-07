<?php

namespace App\Http\Controllers;

use App\Models\Bag;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Product;
use App\Models\Prodvar;
use App\Support\IdAllocator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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
class CartAPI extends Controller
{
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
                    // No variation row at all: PosAPI refuses the same way
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
    // BAG HELPERS (shared with WishlistAPI)
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
     * to PosAPI::defaultVariation(): the main, else first, live variation.
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
            // rejects integer for a boolean column (PosAPI precedent).
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

    /** `prod_id` may also arrive as a `prod_tag`; a bad key never hits SQL. */
    private function resolveProduct($prodKey): ?Product
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
     * table carries no payment key.
     */
    protected function ordersQuery(?int $custId)
    {
        $query = Order::with([
                'items.bag.prodvar.product',
                'pickup.appointment',
                'delivery',
                'parcel.delivery',
                'parcel.payment',
            ]);

        if ($custId !== null) {
            $query->where('cust_id', $custId);
        }

        return $query;
    }

    /** The bag badge an employee has no meaning for: no customer, no bag. */
    protected function orderScopeCartCount(?int $custId): int
    {
        return $custId === null ? 0 : self::cartCount($custId);
    }

    /**
     * FLOW-ORD_LIST-03: server-side tab buckets. Legacy status spellings are
     * folded in with the DOMAIN 27 vocabulary (POS normalizeStatus) so rows
     * written by older clients still land in a bucket. An unknown or absent
     * filter changes nothing (backward compatible).
     */
    protected function applyOrderFilter($query, string $filter): void
    {
        $buckets = [
            'processing' => ['processing', 'to cancel', 'to process', 'cancel requested', 'cancelling', 'return requested'],
            'to-claim'   => ['to claim', 'to receive', 'delivering', 'transit'],
            'claimed'    => ['claimed', 'received', 'delivered', 'completed'],
            'unclaimed'  => ['unclaimed'],
            'cancelled'  => ['cancelled', 'cancel', 'canceled', 'returned', 'refunded'],
        ];

        $key = strtolower(trim($filter));
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
            'delivery', 'parcel.delivery', 'parcel.payment',
        ]);

        $items   = $order->items->map(fn ($item) => $this->itemPayload($item))->values()->all();
        $payload = $order->toArray();
        $payload['items']    = $items;
        $payload['status']   = $order->ord_status;
        $payload['claiming'] = $order->ord_claiming ?? null;
        $payload['created']  = $order->ord_created ?? null;

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
}
