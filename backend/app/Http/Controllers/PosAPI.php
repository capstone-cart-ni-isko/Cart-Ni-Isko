<?php

namespace App\Http\Controllers;

use App\Exceptions\InsufficientStockException;
use App\Models\Bag;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Prodsales;
use App\Models\Prodvar;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * DOMAIN 11 (walk-in orders / point of sale).
 *
 * A POS order is an `orders` row that belongs to the shared walk-in customer
 * (D11: cust_phone 0000000000, cust_type guest, cust_givname "Walk-in"),
 * carries `ord_claiming = 'pickup'` and has NEITHER a `pickup` nor a
 * `delivery` row - that absence is what `Order::isWalkIn()` keys on, and it
 * also keeps register drafts and finished sales out of the D12 orders list
 * (which only shows orders that do have one of those rows).
 *
 * Drafts stay in `ord_status = 'processing'` with `bag_placed = false` on
 * their bag rows; `POST /pos/checkout` completes them in one transaction:
 * stock is deducted (REQ-WALKIN-03), the bags are marked placed, the sale is
 * written to `prodsales`, `pay_reference` becomes `POS-PAY-<8>` and the
 * employee is logged (REQ-WALKIN-04).
 */
class PosAPI extends Controller
{
    /** The shared walk-in account, resolved once per request. */
    private ?Customer $walkInCache = null;

    /*
        Adding products to a POS order (in-store, no customer account needed)
        ----------
        JSON REQUEST

        prod_id - integer|string (req)
        item_qty - integer (opt, default: 1)
        item_amount - numeric (opt, the frontend may echo its own line total)
        ord_id - integer (opt, if adding to an existing POS order)
    */
    public function addProductToOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->posAddProductToOrder($json);
        if ($validator) return $validator;

        try {
            $walkIn = $this->walkInCustomer();
            $prodKey = $json->input('prod_id');
            $qty = max(1, (int) $json->input('item_qty', 1));
            $ordId = $json->input('ord_id');

            $product = $this->resolveProduct($prodKey);
            if (! $product) {
                return response()->json(['success' => false, 'message' => 'Product not found'], 404);
            }
            if (! $product->isBuyable()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                ], 400);
            }

            // The register adds a product, not a variation: ring it up on the
            // main (otherwise first) live variation.
            $prodvar = $this->defaultVariation($product);
            if (! $prodvar || $prodvar->prodvar_disabled) {
                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                ], 400);
            }

            $order = null;
            if ($ordId !== null && $ordId !== '' && $ordId !== 0) {
                $resolved = $this->draftOrder($ordId, $walkIn);
                if ($resolved instanceof JsonResponse) {
                    return $resolved;
                }
                $order = $resolved;
            }

            $unit = round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2);

            $result = DB::transaction(function () use (&$order, $walkIn, $product, $prodvar, $qty, $unit) {
                $createdOrder = false;

                if (! $order) {
                    // No ord_id: the first add rings up an anonymous register draft.
                    $order = Order::create([
                        'cust_id'       => $walkIn->cust_id,
                        'ord_amount'    => 0,
                        'ord_status'    => 'processing',
                        'ord_claiming'  => 'pickup',
                        'pay_received'  => 0,
                        'pay_change'    => 0,
                        'pay_reference' => null,
                        'ord_created'   => now(),
                    ]);
                    $createdOrder = true;
                }

                $lineBagIds = Item::where('ord_id', $order->ord_id)->pluck('bag_id');
                $bag = Bag::with(['prodvar.product'])
                    ->whereIn('bag_id', $lineBagIds)
                    ->where('prodvar_id', $prodvar->prodvar_id)
                    ->whereNull('bag_deleted')
                    ->first();

                $createdItem = false;
                $message = 'Product quantity updated in POS order';

                if ($bag) {
                    $newQty = (int) $bag->bag_qty + $qty;
                    $bag->update([
                        'bag_qty'    => $newQty,
                        'bag_amount' => round($unit * $newQty, 2),
                    ]);
                } else {
                    $bag = Bag::create([
                        'cust_id'     => $walkIn->cust_id,
                        'prodvar_id'  => $prodvar->prodvar_id,
                        'bag_qty'     => $qty,
                        'bag_amount'  => round($unit * $qty, 2),
                        // DB::raw: a PHP bool binding is sent as an integer and
                        // Postgres rejects integer for a boolean column.
                        'bag_placed'  => DB::raw('false'),
                        'bag_created' => now(),
                        'bag_deleted' => null,
                    ]);
                    Item::create([
                        'ord_id'       => $order->ord_id,
                        'bag_id'       => $bag->bag_id,
                        'item_created' => now(),
                    ]);
                    $createdItem = true;
                    $message = $createdOrder
                        ? 'New POS order created and product added successfully'
                        : 'Product added to existing POS order successfully';
                }

                $total = $this->orderTotal($order->ord_id);
                Order::where('ord_id', $order->ord_id)->update(['ord_amount' => $total]);
                $this->syncBagCounter((int) $walkIn->cust_id);

                return [
                    'order'   => Order::with(['items.bag.prodvar.product', 'pickup', 'delivery'])
                        ->where('ord_id', $order->ord_id)->first(),
                    'bag'     => Bag::with(['prodvar.product'])->where('bag_id', $bag->bag_id)->first(),
                    'created' => $createdOrder || $createdItem,
                    'message' => $message,
                ];
            });

            $payload = $this->bagItemArray($result['bag']);
            $payload['ord_id'] = $result['order']->ord_id;
            $payload['item_id'] = $result['bag']->bag_id;
            $payload['item_created'] = $result['bag']->bag_created;

            return response()->json([
                'success' => true,
                'message' => $result['message'],
                'data' => [
                    'order'  => $this->orderPayload($result['order']),
                    'item'   => $payload,
                    'ord_id' => $result['order']->ord_id,
                ],
            ], $result['created'] ? 201 : 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add product to POS order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Checking out a POS order (in-store payment, always picked up at the counter)
        ----------
        JSON REQUEST

        ord_id - integer (req)
        pay_given - numeric (req)
        pay_ref - string (opt)
        appoint_id - integer (opt, accepted for legacy payloads; a walk-in
                      order holds no appointment - it has no pickup row)
    */
    public function checkoutOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->posCheckoutOrder($json);
        if ($validator) return $validator;

        try {
            $walkIn = $this->walkInCustomer();
            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
            }
            if (! $this->isWalkInOrder($order)) {
                return response()->json(['success' => false, 'message' => 'Order is not a POS order.'], 409);
            }

            $order->load(['items.bag.prodvar.product', 'pickup', 'delivery']);

            // REQ-WALKIN-06: a finished sale answers again, never re-rings.
            if (in_array($order->ord_status, ['claimed', 'received'], true)) {
                return response()->json([
                    'success' => true,
                    'message' => 'POS order was already checked out.',
                    'data'    => $this->checkoutResponse(
                        $order,
                        $this->paymentPayload($order, (float) $order->pay_received, (float) $order->pay_change),
                        $walkIn
                    ),
                ], 200);
            }

            if ($order->ord_status !== 'processing' || $order->items->isEmpty()) {
                return response()->json(['success' => false, 'message' => 'POS order cannot be checked out.'], 409);
            }

            $payGiven = (float) $json->input('pay_given');
            $totalDue = round((float) $order->items->sum(fn ($item) => $item->bag ? (float) $item->bag->bag_amount : 0), 2);

            if ($payGiven < $totalDue) {
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient payment. Total due is ' . number_format($totalDue, 2)
                        . ', but ' . number_format($payGiven, 2) . ' was given.',
                ], 400);
            }

            $payRef = $json->input('pay_ref') ?: ('POS-PAY-' . strtoupper(Str::random(8)));

            // REQ-WALKIN-03 / REQ-OC-02: one transaction, so an out-of-stock
            // line rolls the whole register sale back to the draft.
            $result = DB::transaction(function () use ($json, $order, $walkIn, $payGiven, $payRef) {
                $locked = Order::with(['items.bag.prodvar.product'])
                    ->where('ord_id', $order->ord_id)
                    ->lockForUpdate()
                    ->first();

                if (! $locked || $locked->ord_status !== 'processing' || $locked->items->isEmpty()) {
                    throw new \RuntimeException('POS order cannot be checked out.');
                }

                // Pass 1: lock and verify every variation still holds the stock.
                $lines = [];
                $subtotal = 0.0;
                foreach ($locked->items as $item) {
                    $bag = $item->bag;
                    if (! $bag || ! $bag->prodvar_id) continue;

                    $prodvar = Prodvar::where('prodvar_id', $bag->prodvar_id)->lockForUpdate()->first();
                    if (! $prodvar) {
                        throw new \RuntimeException('A product in the walk-in order is no longer available.');
                    }

                    $name = $prodvar->product
                        ? $prodvar->product->prod_name
                        : ('variation #' . $prodvar->prodvar_id);

                    if ((int) $prodvar->prodvar_stock < (int) $bag->bag_qty) {
                        throw new InsufficientStockException('Insufficient stock for ' . $name);
                    }

                    $lines[] = ['bag' => $bag, 'prodvar' => $prodvar, 'name' => $name];
                    $subtotal += (float) $bag->bag_amount;
                }

                $subtotal = round($subtotal, 2);
                if ($lines === []) {
                    throw new \RuntimeException('POS order cannot be checked out.');
                }
                if ($payGiven < $subtotal) {
                    throw new \RuntimeException('Payment amount is below the server-calculated total.');
                }
                $payChange = round($payGiven - $subtotal, 2);

                // Pass 2: deduct stock and mark the bag rows as placed.
                $threshold = (int) $this->settingValue('low_stock_threshold', 5);
                $lowStock = [];
                foreach ($lines as $line) {
                    $prodvar = $line['prodvar'];
                    $prodvar->prodvar_stock = (int) $prodvar->prodvar_stock - (int) $line['bag']->bag_qty;
                    $prodvar->save();

                    $line['bag']->update(['bag_placed' => DB::raw('true')]);

                    if ((int) $prodvar->prodvar_stock <= $threshold) {
                        $lowStock[] = ['name' => $line['name'], 'qty' => (int) $prodvar->prodvar_stock];
                    }
                }

                $locked->update([
                    'ord_status'    => 'claimed',
                    'ord_amount'    => $subtotal,
                    'pay_reference' => $payRef,
                    'pay_received'  => $payGiven,
                    'pay_change'    => $payChange,
                ]);

                // Domain 9/14: the sale lands on today's prodsales rows.
                foreach ($lines as $line) {
                    $this->bumpProdsales($line['bag'], $locked, 'place', true);
                }

                $this->syncBagCounter((int) $walkIn->cust_id);

                // REQ-IM-03: priority low-stock alerts for admins.
                foreach ($lowStock as $low) {
                    $this->notifyEmployeesByType(
                        ['ADMIN', 'SUPER ADMIN'],
                        '[PRIORITY] Low stock: "' . $low['name'] . '" is now down to ' . $low['qty'] . ' unit(s).'
                    );
                }

                // REQ-WALKIN-04: every walk-in sale is logged with employee ID.
                $employee = $json->user('api');
                if ($this->isEmployee($employee)) {
                    $this->logEmployee(
                        (int) $employee->emp_id,
                        'edit',
                        'pos/checkout walk-in order #' . $locked->ord_id
                            . ' - ' . $payRef
                    );
                }

                return [
                    'order' => Order::with(['items.bag.prodvar.product', 'pickup', 'delivery'])
                        ->where('ord_id', $locked->ord_id)->first(),
                    'payment' => [
                        'pay_ref'       => $payRef,
                        'pay_reference' => $payRef,
                        'pay_given'     => $payGiven,
                        'pay_due'       => $subtotal,
                        'pay_change'    => $payChange,
                        'ord_amount'    => $subtotal,
                    ],
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'POS order checked out successfully',
                'data'    => $this->checkoutResponse($result['order'], $result['payment'], $walkIn),
            ], 201);

        } catch (InsufficientStockException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);

        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to checkout POS order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Updating POS order details
        ----------
        JSON REQUEST

        ord_id - integer (req)
        ord_status - string (opt, new vocabulary or a legacy alias)
        ord_tag / ord_rating / ord_review / ord_completed - accepted but ignored
            (those columns are gone: tags live in `bag`, ratings in `reviews`
             and completion in `appointments.appoint_closed` / `delivery.deliver_end`)
    */
    public function updateOrderDetails(Request $json)
    {
        $validator = (new InputValidatorAPI())->posUpdateOrderDetails($json);
        if ($validator) return $validator;

        try {
            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
            }
            if (! $this->isWalkInOrder($order)) {
                return response()->json(['success' => false, 'message' => 'Order is not a POS order.'], 409);
            }

            if (! $json->has('ord_status')) {
                return response()->json(['success' => false, 'message' => 'No updatable fields provided'], 400);
            }

            $status = $this->normalizeStatus((string) $json->input('ord_status'));
            if ($status === null) {
                return response()->json(['success' => false, 'message' => 'Unsupported order status.'], 422);
            }

            $priorStatus = (string) $order->ord_status;
            $allowed = [
                'processing' => ['claimed', 'received', 'cancelled'],
                'claimed'    => ['received', 'cancelled'],
                'received'   => ['cancelled'],
                'cancelled'  => [],
                'unclaimed'  => ['cancelled', 'claimed'],
            ];

            if ($status === $priorStatus) {
                return response()->json([
                    'success' => true,
                    'message' => 'POS order details updated successfully',
                    'data'    => $this->orderPayload($order->fresh(['items.bag.prodvar.product', 'pickup', 'delivery'])),
                ], 200);
            }

            if (! in_array($status, $allowed[$priorStatus] ?? [], true)) {
                return response()->json(['success' => false, 'message' => 'Invalid order status transition.'], 409);
            }

            $employee = $json->user('api');
            if (! $this->isEmployee($employee) || ! $this->isAdmin($employee)) {
                return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
            }

            $order->load(['items.bag.prodvar.product']);

            DB::transaction(function () use ($order, $status, $priorStatus) {
                $order->update(['ord_status' => $status]);

                // A manual completion behaves exactly like the register sale.
                if (in_array($status, ['claimed', 'received'], true) && $priorStatus === 'processing') {
                    $this->completeWalkInOrder($order);
                }

                // Cancelling a sale that already left the shelf puts it back.
                if ($status === 'cancelled' && in_array($priorStatus, ['claimed', 'received'], true)) {
                    foreach ($order->items as $item) {
                        $bag = $item->bag;
                        if ($bag && $bag->prodvar_id) {
                            Prodvar::where('prodvar_id', $bag->prodvar_id)
                                ->increment('prodvar_stock', (int) $bag->bag_qty);
                        }
                        if ($bag) {
                            $this->bumpProdsales($bag, $order, 'cancel', true);
                        }
                    }
                }
            });

            $this->logEmployee(
                (int) $employee->emp_id,
                'edit',
                'pos/update ' . $status . ' - walk-in order #' . $order->ord_id
            );

            if ((int) $order->cust_id > 0 && $status === 'cancelled') {
                $this->notifyCustomer((int) $order->cust_id, 'Walk-in order #' . $order->ord_id . ' was cancelled.');
            }

            return response()->json([
                'success' => true,
                'message' => 'POS order details updated successfully',
                'data'    => $this->orderPayload($order->fresh(['items.bag.prodvar.product', 'pickup', 'delivery'])),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update POS order details',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Removing a product from a POS order
        ----------
        JSON REQUEST

        ord_id - integer (req)
        prod_id - integer|string (req)
    */
    public function removeProductFromOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->removeProductFromOrder($json);
        if ($validator) return $validator;

        try {
            $walkIn = $this->walkInCustomer();
            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
            }
            if (! $this->isWalkInOrder($order) || $order->ord_status !== 'processing') {
                return response()->json(['success' => false, 'message' => 'This POS order is no longer editable.'], 409);
            }

            $prodKey = $json->input('prod_id');
            $lineBagIds = Item::where('ord_id', $order->ord_id)->pluck('bag_id');
            if ($lineBagIds->isEmpty()) {
                return response()->json(['success' => false, 'message' => 'Product not found in this POS order'], 404);
            }

            $product = $this->resolveProduct($prodKey);
            $prodvarIds = $product
                ? Prodvar::where('prod_id', $product->prod_id)->pluck('prodvar_id')->all()
                : [];

            $bag = Bag::with(['prodvar.product'])
                ->whereIn('bag_id', $lineBagIds)
                ->whereNull('bag_deleted')
                ->where(function ($query) use ($prodKey, $prodvarIds) {
                    $query->whereIn('prodvar_id', $prodvarIds);
                    if (is_numeric($prodKey)) {
                        $query->orWhere('prodvar_id', (int) $prodKey);
                    }
                })
                ->first();

            if (! $bag) {
                return response()->json(['success' => false, 'message' => 'Product not found in this POS order'], 404);
            }

            Item::where('bag_id', $bag->bag_id)->delete();
            $bag->update(['bag_deleted' => now(), 'bag_placed' => DB::raw('false')]);

            Order::where('ord_id', $order->ord_id)
                ->update(['ord_amount' => $this->orderTotal($order->ord_id)]);
            $this->syncBagCounter((int) $walkIn->cust_id);

            return response()->json([
                'success' => true,
                'message' => 'Product removed from POS order successfully',
                'data'    => [
                    'ord_id'  => $order->ord_id,
                    'bag_id'  => $bag->bag_id,
                    'prod_id' => $prodKey,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove product from POS order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    /** The shared walk-in account (D11 / REQ-WALKIN-05). */
    private function walkInCustomer(): Customer
    {
        if ($this->walkInCache instanceof Customer) {
            return $this->walkInCache;
        }

        $walkIn = Customer::firstOrCreate(
            ['cust_phone' => self::WALK_IN_PHONE],
            [
                'cust_givname'             => 'Walk-in',
                'cust_surname'             => '',
                'cust_email'               => null,
                'cust_password'            => Hash::make(Str::random(32)),
                'cust_callcode'            => '+63',
                'cust_pronoun'             => 'they/them',
                'cust_type'                => 'guest',
                'cust_categ'               => null,
                'cust_college'             => null,
                'cust_dept'                => null,
                'cust_address'             => null,
                'cust_bday'                => null,
                'cust_avatar'              => null,
                'cust_backup_phone'        => null,
                'cust_backup_email'        => null,
                'cust_backup_ques'         => null,
                'cust_backup_answer'       => null,
                'cust_backup_code'         => '/',
                // DB::raw: PHP bool bindings reach Postgres as integers.
                'cust_darkmode'            => DB::raw('false'),
                'cust_notif_appointremind' => 10,
                'cust_notif_email'         => DB::raw('false'),
                'cust_notif_prod'          => DB::raw('false'),
                'cust_appoint'             => 0,
                'cust_orders'              => 0,
                'cust_bag'                 => 0,
                'cust_wishlist'            => 0,
                'cust_unread'              => 0,
                'cust_created'             => now(),
            ]
        );

        if ($walkIn->wasRecentlyCreated) {
            // DB::raw leaves Expression objects in the boolean attributes; reload
            // the row so consumers see real booleans.
            $walkIn->refresh();
        }

        return $this->walkInCache = $walkIn;
    }

    /** Guarded order lookup: a non-numeric id never reaches the database. */
    private function findOrder($ordId): ?Order
    {
        if ($ordId === null || $ordId === '' || ! is_numeric($ordId) || (int) $ordId <= 0) {
            return null;
        }

        return Order::find((int) $ordId);
    }

    /** Does this order belong to the register (walk-in, no fulfillment rows)? */
    private function isWalkInOrder(Order $order): bool
    {
        if ((int) $order->cust_id !== (int) $this->walkInCustomer()->cust_id) {
            return false;
        }

        return ! $order->pickup()->exists() && ! $order->delivery()->exists();
    }

    /**
     * Resolves the register draft a request points at, or the exact response
     * to send back when the id is not an editable walk-in order.
     */
    private function draftOrder($ordId, Customer $walkIn)
    {
        $order = $this->findOrder($ordId);
        if (! $order) {
            return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
        }

        if ((int) $order->cust_id !== (int) $walkIn->cust_id
            || $order->ord_status !== 'processing'
            || $order->pickup()->exists()
            || $order->delivery()->exists()) {
            return response()->json(['success' => false, 'message' => 'This POS order is no longer editable.'], 409);
        }

        return $order;
    }

    /** The register rings a product up on its main (else first) live variation. */
    private function defaultVariation(Product $product): ?Prodvar
    {
        return Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->whereNull('prodvar_disabled')
            ->orderByDesc('prodvar_main')
            ->orderBy('prodvar_id')
            ->first();
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

    /** Live `ord_amount` for a draft: the sum of its bag rows' amounts. */
    private function orderTotal(int $ordId): float
    {
        $bagIds = Item::where('ord_id', $ordId)->pluck('bag_id');
        if ($bagIds->isEmpty()) {
            return 0.0;
        }

        return round((float) Bag::whereIn('bag_id', $bagIds)->whereNull('bag_deleted')->sum('bag_amount'), 2);
    }

    /**
     * REQ-WALKIN-03: the manual completion path (`/pos/update`) must deduct
     * stock and record the sale exactly like `POST /pos/checkout` does.
     */
    private function completeWalkInOrder(Order $order): void
    {
        $order->loadMissing('items.bag.prodvar.product');

        foreach ($order->items as $item) {
            $bag = $item->bag;
            if (! $bag || ! $bag->prodvar_id) continue;

            Prodvar::where('prodvar_id', $bag->prodvar_id)
                ->where('prodvar_stock', '>=', (int) $bag->bag_qty)
                ->decrement('prodvar_stock', (int) $bag->bag_qty);

            $bag->update(['bag_placed' => DB::raw('true')]);
            $this->bumpProdsales($bag, $order, 'place', true);
        }

        if (! $order->pay_reference) {
            $order->update(['pay_reference' => 'POS-PAY-' . strtoupper(Str::random(8))]);
        }
    }

    /** `data` for every `/pos/checkout` answer (legacy keys preserved). */
    private function checkoutResponse(Order $order, array $payment, Customer $walkIn): array
    {
        return [
            'payment'   => $payment,
            'order'     => $this->orderPayload($order),
            'pickup_id' => null, // D11: a walk-in order holds no pickup row
            'walk_in'   => $this->walkInPayload($walkIn),
            'ord_id'    => $order->ord_id,
        ];
    }

    private function walkInPayload(Customer $customer): array
    {
        return [
            'cust_id'       => $customer->cust_id,
            'cust_givname'  => $customer->cust_givname,
            'cust_surname'  => $customer->cust_surname,
            'cust_nickname' => $customer->cust_givname, // legacy alias (spec section 6)
            'cust_phone'    => $customer->cust_phone,
            'cust_type'     => $customer->cust_type,
        ];
    }

    private function paymentPayload(Order $order, float $given, float $change): array
    {
        return [
            'pay_ref'       => $order->pay_reference,
            'pay_reference' => $order->pay_reference,
            'pay_given'     => $given,
            'pay_due'       => (float) $order->ord_amount,
            'pay_change'    => $change,
            'ord_amount'    => (float) $order->ord_amount,
        ];
    }

    /** REQ-BAG-03: the badge counter mirrors the live bag line count. */
    private function syncBagCounter(int $custId): void
    {
        $count = Bag::where('cust_id', $custId)
            ->whereNull('bag_deleted')
            ->whereRaw('bag_placed = false')
            ->count();

        Customer::where('cust_id', $custId)->update(['cust_bag' => $count]);
    }

    /** Legacy and new status spellings -> the DOMAIN 27 vocabulary. */
    private function normalizeStatus(?string $raw): ?string
    {
        if ($raw === null) return null;

        $trimmed = trim($raw);
        $key = strtoupper($trimmed);

        $map = [
            'TO PROCESS'       => 'processing',
            'PROCESSING'       => 'processing',
            'TO CANCEL'        => 'to cancel',
            'CANCEL REQUESTED' => 'to cancel',
            'CANCELLING'       => 'to cancel',
            'TO CLAIM'         => 'to claim',
            'DELIVERING'       => 'delivering',
            'TRANSIT'          => 'delivering',
            'TO RECEIVE'       => 'to receive',
            'CLAIMED'          => 'claimed',
            'RECEIVED'         => 'received',
            'DELIVERED'        => 'received',
            'COMPLETED'        => 'received',
            'UNCLAIMED'        => 'unclaimed',
            'CANCEL'           => 'cancelled',
            'CANCELED'         => 'cancelled',
            'CANCELLED'        => 'cancelled',
            'RETURN REQUESTED' => 'to cancel',
            'RETURNED'         => 'cancelled',
            'REFUNDED'         => 'cancelled',
        ];

        if (isset($map[$key])) {
            return $map[$key];
        }

        $vocabulary = ['processing', 'to cancel', 'to claim', 'delivering', 'to receive', 'claimed', 'received', 'unclaimed', 'cancelled'];

        return in_array(strtolower($trimmed), $vocabulary, true) ? strtolower($trimmed) : null;
    }

    /**
     * DOMAIN 9 / 14 upkeep: one `prodsales` row per variation per day.
     *
     * 'place'  -> qty/amount/bag + cust/guest + walkin/preorder counters
     * 'cancel' -> those counters reversed, cancelled + 1
     * 'claim'  -> makes sure the day's row exists (no double counting)
     */
    private function bumpProdsales(Bag $bag, Order $order, string $mode, bool $walkIn): void
    {
        try {
            $prodvarId = (int) $bag->prodvar_id;
            if ($prodvarId <= 0) return;

            $date = $order->ord_created
                ? \Carbon\Carbon::parse($order->ord_created)->toDateString()
                : today()->toDateString();

            $row = Prodsales::where('prodvar_id', $prodvarId)
                ->where('prodsales_date', $date)
                ->first();

            $customer = Customer::find($order->cust_id);
            $isBueno = $customer
                && ! preg_match('/guest/i', (string) ($customer->cust_type ?? ''));

            if (! $row) {
                $row = new Prodsales();
                $row->prodvar_id = $prodvarId;
                $row->prodsales_date = $date;
                $row->prodsales_qty = 0;
                $row->prodsales_amount = 0;
                $row->prodsales_bag = 0;
                $row->prodsales_cust = 0;
                $row->prodsales_guest = 0;
                $row->prodsales_walkin = 0;
                $row->prodsales_preorder = 0;
                $row->prodsales_unsold = 0;
                $row->prodsales_cancelled = 0;
                $row->prodsales_wishlist = 0;
                $row->prodsales_bueno_categ = $isBueno ? $customer->cust_categ : null;
                $row->prodsales_college = $isBueno ? $customer->cust_college : null;
                $row->prodsales_created = now();
            }

            if ($mode === 'claim') {
                $row->save();
                return;
            }

            $sign = $mode === 'cancel' ? -1 : 1;
            $qty = (int) $bag->bag_qty;
            $amount = round((float) $bag->bag_amount, 2);

            $row->prodsales_qty = (int) $row->prodsales_qty + ($sign * $qty);
            $row->prodsales_amount = round((float) $row->prodsales_amount + ($sign * $amount), 2);
            $row->prodsales_bag = (int) $row->prodsales_bag + $sign;
            $row->prodsales_cust = (int) $row->prodsales_cust + ($isBueno ? $sign : 0);
            $row->prodsales_guest = (int) $row->prodsales_guest + ($isBueno ? 0 : $sign);
            $row->prodsales_walkin = (int) $row->prodsales_walkin + ($walkIn ? $sign : 0);
            $row->prodsales_preorder = (int) $row->prodsales_preorder + ($walkIn ? 0 : $sign);

            if ($mode === 'cancel') {
                $row->prodsales_cancelled = (int) $row->prodsales_cancelled + 1;
            }

            $row->save();
        } catch (\Throwable $e) {
            // Metrics must never break the flow they describe.
        }
    }

    // ==========================================
    // PAYLOAD HELPERS (legacy aliases, spec section 6)
    // ==========================================

    private function bagItemArray(Bag $bag): array
    {
        $bag->loadMissing(['prodvar.product']);
        $prodvar = $bag->prodvar;
        $product = $prodvar ? $prodvar->product : null;

        return [
            'bag_id'       => $bag->bag_id,
            'cust_id'      => $bag->cust_id,
            'prodvar_id'   => $bag->prodvar_id,
            'bag_qty'      => (int) $bag->bag_qty,
            'bag_amount'   => (float) $bag->bag_amount,
            'bag_placed'   => (bool) $bag->bag_placed,
            'bag_created'  => $bag->bag_created,
            'bag_deleted'  => $bag->bag_deleted,
            'item_id'      => $bag->bag_id,
            'item_qty'     => (int) $bag->bag_qty,
            'item_amount'  => (float) $bag->bag_amount,
            'prod_id'      => $product ? $product->prod_id : null,
            'prod_tag'     => $product ? $product->prod_tag : null,
            'prod_name'    => $product ? $product->prod_name : null,
            'prodvar_name' => $prodvar ? $prodvar->prodvar_name : null,
            'product'      => $this->productPayload($product, $prodvar),
        ];
    }

    private function productPayload($product, $prodvar = null): ?array
    {
        if (! $product) {
            return null;
        }

        $variants = Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->get();

        $payload = $product->toArray();
        $payload['prod_qty'] = (int) $variants->sum('prodvar_stock');
        $payload['prod_preorder'] = $variants->contains(fn ($v) => (bool) $v->prodvar_preorder);
        $payload['prod_sizes'] = $variants->pluck('prodvar_name')->values()->all();
        $payload['prod_images'] = $variants->pluck('prodvar_pic')->filter()->unique()->values()->all();

        if ($prodvar) {
            $payload['prodvar_id'] = $prodvar->prodvar_id;
            $payload['prodvar_name'] = $prodvar->prodvar_name;
            $payload['prodvar_pic'] = $prodvar->prodvar_pic;
            $payload['prodvar_markup'] = $prodvar->prodvar_markup;
            $payload['prodvar_stock'] = (int) $prodvar->prodvar_stock;
            $payload['prodvar_preorder'] = (bool) $prodvar->prodvar_preorder;
            $payload['unit_price'] = round(
                (float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0),
                2
            );
        }

        return $payload;
    }

    private function orderPayload(Order $order): array
    {
        $order->loadMissing(['items.bag.prodvar.product', 'pickup', 'delivery']);

        $items = $order->items->map(function ($item) {
            $bag = $item->bag;
            if (! $bag) {
                return [
                    'item_id' => $item->item_id,
                    'ord_id'  => $item->ord_id,
                    'bag_id'  => $item->bag_id,
                    'product' => null,
                ];
            }

            $array = $this->bagItemArray($bag);
            $array['item_id'] = $item->item_id;
            $array['ord_id'] = $item->ord_id;
            $array['item_created'] = $item->item_created;

            return $array;
        })->values()->all();

        $payload = $order->toArray();
        $payload['items'] = $items;
        $payload['status'] = $order->ord_status;
        $payload['amount'] = $order->ord_amount;
        $payload['created'] = $order->ord_created;
        $payload['dispatch_type'] = $order->ord_claiming;
        $payload['ord_tag'] = null;
        $payload['is_preorder'] = $order->pickup !== null || $order->delivery !== null;
        $payload['is_walk_in'] = $order->pickup === null && $order->delivery === null;

        return $payload;
    }
}
