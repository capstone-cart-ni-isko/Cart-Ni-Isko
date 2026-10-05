<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 25 (BAG / CART) endpoints.
 *
 * The live database has NO separate `bag` table and NO `prodvar` table.
 * Cart rows are `orders` entries tagged `CART-<uuid>` with their product
 * lines in the `items` table (ord_id, prod_id, item_qty, item_amount).
 *
 * Response payloads keep the shape the frontend renders:
 *   { ord_id, ord_tag, items[], ord_status, ... }
 * Each item carries the full `product` relation so the cart UI never
 * needs a second round trip.
 */
class CartAPI extends Controller
{
    // ==========================================
    // ADD TO CART
    // ==========================================

    /*
        Adding a product to the cart
        ----------
        JSON REQUEST

        cust_id   - integer (req)
        prod_id   - integer|string (req: product id or tag)
        item_qty  - integer (opt, default: 1)
        items     - array of {prod_id, item_qty} (opt, multi-add)
    */
    public function addOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->addOrder($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $customer = Customer::find($custId);
            if (! $customer) {
                return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
            }

            // Accept a single product or a batch
            $itemsInput = [];
            if ($json->has('items') && is_array($json->input('items'))) {
                $itemsInput = $json->input('items');
            } elseif ($json->has('prod_id')) {
                $itemsInput[] = [
                    'prod_id'  => $json->input('prod_id'),
                    'item_qty' => $json->input('item_qty', 1),
                ];
            } else {
                return response()->json([
                    'success' => false,
                    'message' => 'prod_id or items array is required.',
                ], 400);
            }

            if (count($itemsInput) === 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'No products provided.',
                ], 400);
            }

            $createdOrders = [];

            foreach ($itemsInput as $lineInput) {
                $prodKey = $lineInput['prod_id'] ?? null;
                if (! $prodKey) continue;

                $product = is_numeric($prodKey)
                    ? Product::where('prod_id', $prodKey)->first()
                    : Product::where('prod_tag', $prodKey)->first();

                if (! $product || ! $product->isBuyable()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product "' . ($product?->prod_name ?? $prodKey) . '" is not available.',
                    ], 400);
                }

                $qty = max(1, (int) ($lineInput['item_qty'] ?? $lineInput['bag_qty'] ?? 1));
                $unitPrice = round((float) $product->prod_price, 2);
                $lineAmount = round($unitPrice * $qty, 2);

                // Check if this product is already in an unplaced CART-* order
                $existingOrder = Order::where('cust_id', $custId)
                    ->where('ord_status', 'CART')
                    ->whereNotNull('ord_tag')
                    ->whereRaw("ord_tag LIKE 'CART-%'")
                    ->whereHas('items', function ($q) use ($product) {
                        $q->where('prod_id', $product->prod_id);
                    })
                    ->first();

                if ($existingOrder) {
                    // Merge: increment quantity
                    $existingItem = Item::where('ord_id', $existingOrder->ord_id)
                        ->where('prod_id', $product->prod_id)
                        ->first();
                    if ($existingItem) {
                        $newQty = $existingItem->item_qty + $qty;
                        $existingItem->update([
                            'item_qty'    => $newQty,
                            'item_amount' => round($unitPrice * $newQty, 2),
                        ]);
                        $existingOrder->refresh();
                        $createdOrders[] = $existingOrder;
                        continue;
                    }
                }

                // Create a new CART-* order for this product line
                $order = Order::create([
                    'cust_id'     => $custId,
                    'ord_created' => now(),
                    'ord_tag'     => 'CART-' . strtoupper(Str::random(12)),
                    'ord_status'  => 'CART',
                ]);

                Item::create([
                    'ord_id'      => $order->ord_id,
                    'prod_id'     => $product->prod_id,
                    'item_qty'    => $qty,
                    'item_amount' => $lineAmount,
                ]);

                $order->refresh();
                $createdOrders[] = $order;
            }

            $this->syncCartCounter($custId);

            $rows = collect($createdOrders)
                ->map(fn ($o) => $this->cartOrderPayload($o->load('items.product')))
                ->values();

            return response()->json([
                'success' => true,
                'message' => 'Added to cart successfully',
                'data'    => [
                    'orders'  => $rows->all(),
                    'order'   => $rows->first(),
                    'items'   => $rows->flatMap(fn ($r) => $r['items'] ?? [])->values()->all(),
                    // Legacy aliases: ord_id of the first order
                    'ord_id'  => $createdOrders ? $createdOrders[0]->ord_id : null,
                    'bag_ids' => $rows->pluck('ord_id')->all(),
                ],
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
        Displaying cart entries or placed orders
        ----------
        Query Params

        cust_id        - integer (opt, forced to auth user)
        tag_prefix     - string (CART-* forces cart view)
        exclude_prefix - string (CART-* excludes cart entries → orders view)
        ord_id         - integer (opt, single order)
        ord_status     - string (opt)
    */
    public function displayOrders(Request $json)
    {
        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            if ($this->wantsBagRows($json)) {
                // Cart view: CART-* tagged orders
                $orders = Order::with(['items.product'])
                    ->where('cust_id', $custId)
                    ->where('ord_status', 'CART')
                    ->whereNotNull('ord_tag')
                    ->whereRaw("ord_tag LIKE 'CART-%'")
                    ->orderByDesc('ord_created')
                    ->get();

                $this->syncCartCounter($custId);

                return response()->json([
                    'success' => true,
                    'message' => 'Cart retrieved successfully',
                    'data'    => $orders->map(fn ($o) => $this->cartOrderPayload($o))->values()->all(),
                ], 200);
            }

            // Orders view: exclude CART-* entries
            $query = Order::with(['items.product', 'pickup.appointment', 'pickup.payment', 'parcel.delivery', 'parcel.payment'])
                ->where('cust_id', $custId)
                ->where(function ($q) {
                    $q->whereNull('ord_tag')
                      ->orWhereRaw("ord_tag NOT LIKE 'CART-%'");
                });

            if ($json->has('ord_status')) {
                $query->where('ord_status', $json->input('ord_status'));
            }
            if ($json->has('ord_id')) {
                $query->where('ord_id', $json->input('ord_id'));
            }

            $orders = $query->orderByDesc('ord_created')->get();

            return response()->json([
                'success' => true,
                'message' => 'Orders retrieved successfully',
                'data'    => $orders->map(fn ($o) => $this->orderPayload($o))->values()->all(),
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
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $q = trim((string) $json->input('q', ''));

            if ($this->wantsBagRows($json)) {
                $query = Order::with(['items.product'])
                    ->where('cust_id', $custId)
                    ->where('ord_status', 'CART')
                    ->whereRaw("ord_tag LIKE 'CART-%'");

                if ($q !== '') {
                    $query->whereHas('items.product', function ($pq) use ($q) {
                        $pq->where('prod_name', 'like', "%{$q}%")
                           ->orWhere('prod_tag', 'like', "%{$q}%");
                    });
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Cart search completed',
                    'data'    => $query->orderByDesc('ord_created')->get()
                        ->map(fn ($o) => $this->cartOrderPayload($o))->values()->all(),
                ], 200);
            }

            $query = Order::with(['items.product', 'pickup.appointment', 'pickup.payment', 'parcel.delivery', 'parcel.payment'])
                ->where('cust_id', $custId)
                ->where(function ($q2) {
                    $q2->whereNull('ord_tag')
                       ->orWhereRaw("ord_tag NOT LIKE 'CART-%'");
                });

            if ($q !== '') {
                $query->where(function ($builder) use ($q) {
                    $builder->where('ord_status', 'like', "%{$q}%")
                            ->orWhere('ord_tag', 'like', "%{$q}%")
                            ->orWhereHas('items.product', function ($pq) use ($q) {
                                $pq->where('prod_name', 'like', "%{$q}%")
                                   ->orWhere('prod_tag', 'like', "%{$q}%");
                            });
                });
            }

            return response()->json([
                'success' => true,
                'message' => 'Orders search completed',
                'data'    => $query->orderByDesc('ord_created')->get()
                    ->map(fn ($o) => $this->orderPayload($o))->values()->all(),
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
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $sortBy   = $json->input('sort_by', 'date');
            $orderDir = strtolower($json->input('order', 'desc')) === 'asc' ? 'asc' : 'desc';

            $columnMap = [
                'date'   => 'ord_created',
                'status' => 'ord_status',
                'id'     => 'ord_id',
                'amount' => 'ord_created', // no ord_amount column, fall back to date
                'rating' => 'ord_created',
                'tag'    => 'ord_tag',
            ];
            $column = $columnMap[$sortBy] ?? 'ord_created';

            if ($this->wantsBagRows($json)) {
                $orders = Order::with(['items.product'])
                    ->where('cust_id', $custId)
                    ->where('ord_status', 'CART')
                    ->whereRaw("ord_tag LIKE 'CART-%'")
                    ->orderBy('ord_created', $orderDir)
                    ->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Cart sorted successfully',
                    'data'    => $orders->map(fn ($o) => $this->cartOrderPayload($o))->values()->all(),
                ], 200);
            }

            $orders = Order::with(['items.product', 'pickup.appointment', 'pickup.payment', 'parcel.delivery', 'parcel.payment'])
                ->where('cust_id', $custId)
                ->where(function ($q) {
                    $q->whereNull('ord_tag')
                      ->orWhereRaw("ord_tag NOT LIKE 'CART-%'");
                })
                ->orderBy($column, $orderDir)
                ->get();

            return response()->json([
                'success' => true,
                'message' => 'Orders sorted successfully',
                'data'    => $orders->map(fn ($o) => $this->orderPayload($o))->values()->all(),
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
    // REMOVE FROM CART
    // ==========================================

    /*
        Removing a line from the cart
        ----------
        JSON REQUEST

        ord_id - integer (req: the CART-* order id to remove)
        bag_id - integer (opt, legacy alias for ord_id)
    */
    public function removeOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->removeOrder($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $id = $json->input('ord_id') ?? $json->input('bag_id');

            // Find the CART-* order belonging to this customer
            $order = Order::where('ord_id', $id)
                ->where('cust_id', $custId)
                ->first();

            if ($order) {
                // Only allow removing actual cart entries or truly empty orders
                $isCartEntry  = str_starts_with((string) $order->ord_tag, 'CART-');
                $isUnfulfilled = ! $order->pickup()->exists() && ! $order->delivery()->exists();

                if (! $isCartEntry && ! $isUnfulfilled) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Only cart items can be removed.',
                    ], 409);
                }

                // Hard delete the items then the order (no soft-delete on these tables)
                Item::where('ord_id', $order->ord_id)->delete();
                $order->delete();

                $this->syncCartCounter($custId);

                return response()->json([
                    'success' => true,
                    'message' => 'Removed from cart successfully',
                    'data'    => [
                        'ord_id'  => $id,
                        'bag_id'  => $id,
                        'cust_id' => $custId,
                    ],
                ], 200);
            }

            return response()->json(['success' => false, 'message' => 'Cart item not found'], 404);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove from cart',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * True when the caller asked for cart (CART-*) rows.
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
     * Render a CART-* order as the cart-line shape the frontend renders.
     * Each cart line IS one order with one item (the product).
     */
    protected function cartOrderPayload(Order $order): array
    {
        $order->loadMissing(['items.product']);
        $items = $order->items->map(fn ($item) => $this->itemPayload($item))->values()->all();

        $firstItem  = $order->items->first();
        $itemAmount = $firstItem ? (float) $firstItem->item_amount : 0.0;
        $itemQty    = $firstItem ? (int) $firstItem->item_qty : 1;

        return [
            // Canonical order fields
            'ord_id'      => $order->ord_id,
            'cust_id'     => $order->cust_id,
            'ord_tag'     => $order->ord_tag,
            'ord_status'  => $order->ord_status ?? 'CART',
            'ord_created' => $order->ord_created,
            'items'       => $items,
            // Legacy cart-item aliases (cartItemId in the frontend uses ord_id:prod_id)
            'bag_id'      => $order->ord_id,
            'bag_qty'     => $itemQty,
            'bag_amount'  => $itemAmount,
            'ord_amount'  => $itemAmount,
            'amount'      => $itemAmount,
            'item_qty'    => $itemQty,
            'item_amount' => $itemAmount,
            'prod_id'     => $firstItem?->prod_id,
        ];
    }

    /**
     * Render an item row with its product for the cart/order UI.
     */
    protected function itemPayload(Item $item): array
    {
        $item->loadMissing('product');
        $product = $item->product;

        return [
            'item_id'     => $item->item_id,
            'ord_id'      => $item->ord_id,
            'prod_id'     => $item->prod_id,
            'item_qty'    => (int) $item->item_qty,
            'item_amount' => (float) $item->item_amount,
            'product'     => $product ? $this->productPayload($product) : null,
        ];
    }

    /**
     * Render a product row in the shape the frontend catalog mapper understands.
     */
    protected function productPayload(Product $product): array
    {
        $payload = $product->toArray();
        // Ensure the frontend can compute qty / preOrder
        $payload['prod_qty']      = (int) ($product->prod_qty ?? 0);
        $payload['prod_preorder'] = (bool) ($product->prod_preorder ?? ($payload['prod_qty'] <= 0));

        return $payload;
    }

    /**
     * Render a placed (non-CART) order with all its relations.
     */
    protected function orderPayload(Order $order): array
    {
        $order->loadMissing(['items.product', 'pickup.appointment', 'pickup.payment', 'parcel.delivery', 'parcel.payment']);

        $items   = $order->items->map(fn ($item) => $this->itemPayload($item))->values()->all();
        $payload = $order->toArray();
        $payload['items']  = $items;
        $payload['status'] = $order->ord_status;

        // Derive amount from item lines
        $total = $order->items->sum(fn ($item) => (float) $item->item_amount);
        $payload['ord_amount'] = round($total, 2);
        $payload['amount']     = $payload['ord_amount'];

        // Payment from pickup or parcel
        $payment = $order->pickup?->payment ?? $order->parcel?->payment ?? null;
        if ($payment) {
            $payload['pay_ref']       = $payment->pay_ref;
            $payload['pay_given']     = (float) $payment->pay_given;
            $payload['pay_due']       = (float) $payment->pay_due;
            $payload['pay_change']    = (float) $payment->pay_change;
            $payload['pay_reference'] = $payment->pay_ref;
        }

        // Dispatch info
        if ($order->pickup && $order->pickup->appointment) {
            $payload['dispatch_type']  = 'pickup';
            $payload['appoint_id']     = $order->pickup->appointment->appoint_id;
            $payload['appoint_date']   = $order->pickup->appointment->appoint_date;
            $payload['appoint_qr']     = $order->pickup->appointment->appoint_qr;
        }

        if ($order->parcel && $order->parcel->delivery) {
            $delivery = $order->parcel->delivery;
            $payload['dispatch_type']    = 'delivery';
            $payload['deliver_qr']       = $delivery->deliver_qr;
            $payload['deliver_address']  = $delivery->deliver_address;
            $payload['deliver_status']   = $delivery->deliver_status;
            $payload['deliver_date']     = $delivery->deliver_date;
            $payload['delivery_ref']     = $delivery->delivery_ref;
        }

        $payload['is_preorder'] = $order->pickup !== null || $order->parcel !== null;

        return $payload;
    }

    /**
     * REQ-BAG-03: the cust_cart counter mirrors the live cart line count.
     */
    protected function syncCartCounter(int $custId): void
    {
        $count = Order::where('cust_id', $custId)
            ->where('ord_status', 'CART')
            ->whereRaw("ord_tag LIKE 'CART-%'")
            ->count();

        Customer::where('cust_id', $custId)->update(['cust_cart' => $count]);
    }
}
