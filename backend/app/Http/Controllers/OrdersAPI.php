<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Item;
use App\Models\Order;
use App\Models\Pickup;
use App\Models\Product;
use Illuminate\Http\Request;

/**
 * DOMAIN 12 / 27 (pre-orders and the orders list).
 *
 * `ord_status` vocabulary: processing | to cancel | to claim | delivering |
 * to receive | claimed | received | unclaimed | cancelled.
 *
 * The cart line edits (/orders/add, /orders/remove) operate on `items` rows
 * belonging to CART-* orders.
 */
class OrdersAPI extends Controller
{
    /*
        Adding a product to a cart line
        ----------
        JSON REQUEST

        ord_id - integer (req: a CART-* order id)
        prod_id - integer|string (req)
        item_qty - integer (opt, default: 1)
    */
    public function addProductToOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->addProductToOrder($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $prodKey = $json->input('prod_id');
            $qty = max(1, (int) $json->input('item_qty', 1));
            $ordId = (int) $json->input('ord_id');

            $order = Order::where('ord_id', $ordId)
                ->where('cust_id', $custId)
                ->first();

            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found'], 404);
            }

            if (! str_starts_with((string) $order->ord_tag, 'CART-') || $order->ord_status !== 'CART') {
                return response()->json([
                    'success' => false,
                    'message' => 'Products cannot be changed after checkout.',
                ], 409);
            }

            $product = Product::where('prod_id', $prodKey)->first();
            if (! $product || ! $product->isBuyable()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . ($product->prod_name ?? '') . '" is no longer offered',
                ], 400);
            }

            $item = Item::where('ord_id', $order->ord_id)
                ->where('prod_id', $product->prod_id)
                ->first();

            $unit = (float) $product->prod_price;

            if ($item) {
                $newQty = (int) $item->item_qty + $qty;
                $item->update([
                    'item_qty'    => $newQty,
                    'item_amount' => round($unit * $newQty, 2),
                ]);
                $wasRemoved = false;
            } else {
                $item = Item::create([
                    'ord_id'      => $order->ord_id,
                    'prod_id'     => $product->prod_id,
                    'item_qty'    => $qty,
                    'item_amount' => round($unit * $qty, 2),
                ]);
                $wasRemoved = true;
            }

            $this->syncCartCounter($custId);

            $payload = [
                'ord_id'      => $order->ord_id,
                'bag_id'      => $order->ord_id,
                'prod_id'     => $product->prod_id,
                'prod_name'   => $product->prod_name,
                'item_qty'    => $item->item_qty,
                'bag_qty'     => $item->item_qty,
                'item_amount' => (float) $item->item_amount,
                'bag_amount'  => (float) $item->item_amount,
                'product'     => $product->toArray(),
            ];

            return response()->json([
                'success' => true,
                'message' => $wasRemoved
                    ? 'Product added to order successfully'
                    : 'Product quantity updated in order successfully',
                'data'    => $payload,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add product to order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Updating order details (DOMAIN 27)
        ----------
        JSON REQUEST

        ord_id - integer (req)
        ord_status - string (req)
    */
    public function updateOrderDetails(Request $json)
    {
        $validator = (new InputValidatorAPI())->updateOrderDetails($json);
        if ($validator) return $validator;

        try {
            $ordId = $json->input('ord_id');
            $order = Order::with(['pickup.appointment', 'parcel.delivery', 'items.product'])
                ->where('ord_id', $ordId)
                ->first();

            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found'], 404);
            }

            if (! $json->has('ord_status')) {
                return response()->json([
                    'success' => false,
                    'message' => 'No updatable fields provided',
                ], 400);
            }

            $rawStatus = (string) $json->input('ord_status');
            $status = $this->normalizeStatus($rawStatus);
            if ($status === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unsupported order status.',
                ], 422);
            }

            $customerId = $this->customerId($json);
            $priorStatus = (string) $order->ord_status;

            if ($customerId !== null) {
                // ---- customer path -------------------------------------------------
                if ((int) $order->cust_id !== $customerId) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                $requesting = $status === 'to cancel';
                $rawLabel = strtoupper(trim($rawStatus));

                if ($requesting) {
                    $customer = Customer::find($customerId);
                    $walkInError = $this->walkInVisitRequired($customer, $rawLabel);
                    if ($walkInError) {
                        $this->logCustomer(
                            (int) $customer->cust_id,
                            'edit',
                            'orders/update ' . $rawLabel . ' - order #' . $order->ord_id
                                . ' - ' . $walkInError['code']
                        );

                        return response()->json([
                            'success'   => false,
                            'message'   => $walkInError['description'],
                            'code'      => $walkInError['code'],
                            'error'     => $walkInError['description'],
                            'timestamp' => $walkInError['timestamp'],
                        ], 403);
                    }
                }

                $mayRequest = in_array(strtolower($priorStatus), ['processing', 'to claim', 'to receive', 'delivering'], true)
                    || in_array(strtolower($priorStatus), ['to process']);

                if (! $requesting || ! $mayRequest) {
                    return response()->json([
                        'success' => false,
                        'message' => 'This order change requires staff review.',
                    ], 403);
                }

                // FLOW-ORD_LIST-06: the request itself parks the order
                $order->update(['ord_status' => 'CANCEL REQUESTED']);
                $this->logCustomer($customerId, 'edit', 'orders/update to cancel - order #' . $order->ord_id);

                return response()->json([
                    'success' => true,
                    'message' => 'Order details updated successfully',
                    'data'    => $this->orderPayload($order->fresh(['pickup.appointment', 'parcel.delivery', 'items.product'])),
                ], 200);
            }

            // ---- employee path -------------------------------------------------
            if (! $this->isAdmin($json->user('api'))) {
                return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
            }

            // Let staff update to whatever status for now
            $order->update(['ord_status' => strtoupper($status)]);

            return response()->json([
                'success' => true,
                'message' => 'Order status updated successfully',
                'data'    => $this->orderPayload($order->fresh(['pickup.appointment', 'parcel.delivery', 'items.product'])),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update order details',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Removing a product from a cart line
        ----------
        JSON REQUEST

        ord_id - integer (req: CART-* order id)
        prod_id - integer|string (req)
    */
    public function removeProductFromOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->removeProductFromOrder($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $ordId = (int) $json->input('ord_id');
            $prodKey = $json->input('prod_id');

            $order = Order::where('ord_id', $ordId)
                ->where('cust_id', $custId)
                ->first();

            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found'], 404);
            }

            if (! str_starts_with((string) $order->ord_tag, 'CART-') || $order->ord_status !== 'CART') {
                return response()->json([
                    'success' => false,
                    'message' => 'Products cannot be changed after checkout.',
                ], 409);
            }

            $product = Product::where('prod_id', $prodKey)->first();

            if ($product) {
                Item::where('ord_id', $order->ord_id)
                    ->where('prod_id', $product->prod_id)
                    ->delete();
            }

            if (Item::where('ord_id', $order->ord_id)->count() === 0) {
                $order->delete();
                $this->syncCartCounter($custId);
            }

            return response()->json([
                'success' => true,
                'message' => 'Product removed from order successfully',
                'data'    => ['ord_id' => $ordId],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove product from order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    protected function normalizeStatus(string $raw): ?string
    {
        $status = trim(strtolower($raw));

        $map = [
            'to process'       => 'processing',
            'processing'       => 'processing',
            'to cancel'        => 'to cancel',
            'cancel requested' => 'to cancel',
            'to claim'         => 'to claim',
            'delivering'       => 'delivering',
            'to receive'       => 'to receive',
            'claimed'          => 'claimed',
            'received'         => 'received',
            'unclaimed'        => 'unclaimed',
            'cancelled'        => 'cancelled',
            'returned'         => 'returned',
            'refunded'         => 'refunded',
        ];

        return $map[$status] ?? null;
    }

    protected function syncCartCounter(int $custId): void
    {
        $count = Order::where('cust_id', $custId)
            ->where('ord_status', 'CART')
            ->whereRaw("ord_tag LIKE 'CART-%'")
            ->count();

        Customer::where('cust_id', $custId)->update(['cust_cart' => $count]);
    }

    protected function orderPayload(Order $order): array
    {
        $order->loadMissing(['items.product', 'pickup.appointment', 'pickup.payment', 'parcel.delivery', 'parcel.payment']);

        $items = $order->items->map(fn ($item) => [
            'item_id'     => $item->item_id,
            'ord_id'      => $item->ord_id,
            'prod_id'     => $item->prod_id,
            'item_qty'    => (int) $item->item_qty,
            'item_amount' => (float) $item->item_amount,
            'product'     => $item->product ? $item->product->toArray() : null,
        ])->values()->all();

        $total   = $order->items->sum(fn ($item) => (float) $item->item_amount);
        $payload = $order->toArray();
        $payload['items']      = $items;
        $payload['status']     = $order->ord_status;
        $payload['ord_amount'] = round($total, 2);
        $payload['amount']     = $payload['ord_amount'];

        $payment = $order->pickup?->payment ?? $order->parcel?->payment ?? null;
        if ($payment) {
            $payload['pay_ref']       = $payment->pay_ref;
            $payload['pay_reference'] = $payment->pay_ref;
            $payload['pay_given']     = (float) $payment->pay_given;
            $payload['pay_due']       = (float) $payment->pay_due;
            $payload['pay_change']    = (float) $payment->pay_change;
        }

        if ($order->pickup && $order->pickup->appointment) {
            $payload['dispatch_type'] = 'pickup';
            $payload['appoint_id']    = $order->pickup->appointment->appoint_id;
            $payload['appoint_date']  = $order->pickup->appointment->appoint_date;
            $payload['appoint_qr']    = $order->pickup->appointment->appoint_qr;
        }

        if ($order->parcel && $order->parcel->delivery) {
            $delivery = $order->parcel->delivery;
            $payload['dispatch_type']   = 'delivery';
            $payload['deliver_qr']      = $delivery->deliver_qr;
            $payload['deliver_address'] = $delivery->deliver_address;
            $payload['deliver_status']  = $delivery->deliver_status;
            $payload['deliver_date']    = $delivery->deliver_date;
            $payload['delivery_ref']    = $delivery->delivery_ref;
        }

        $payload['is_preorder'] = $order->pickup !== null || $order->parcel !== null;

        return $payload;
    }
}
