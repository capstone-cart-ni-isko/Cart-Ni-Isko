<?php

    namespace App\Http\Controllers;

    use App\Models\Item;
    use App\Models\Order;
    use App\Models\Payment;
    use App\Models\Pickup;
    use App\Models\Product;
    use Illuminate\Http\Request;
    use Illuminate\Support\Str;

    class PosAPI extends Controller
    {
        /*
            Adding products to a POS order (in-store, no customer account needed)
            ----------
            JSON REQUEST

            prod_id - integer (req)
            item_qty - integer (opt, default: 1)
            item_amount - numeric (opt)
            ord_id - integer (opt, if adding to an existing POS order)
        */
        public function addProductToOrder(Request $json)
        {
            $validator = (new InputValidatorAPI())->posAddProductToOrder($json);
            if ($validator) return $validator;

            try {
                $prodId = $json->input('prod_id');
                $ordId  = $json->input('ord_id');

                // Verify product exists and is active
                $product = Product::where('prod_id', $prodId)->first();
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }
                if ($product->prod_disabled || $product->prod_deleted) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product "' . $product->prod_name . '" is no longer offered'
                    ], 400);
                }

                $qty    = max(1, (int)$json->input('item_qty', 1));
                $amount = $json->input('item_amount') !== null
                    ? (float)$json->input('item_amount')
                    : ((float)$product->prod_price * $qty);

                // If ord_id provided, add to existing POS order
                if ($ordId) {
                    $order = Order::where('ord_id', $ordId)->first();
                    if (!$order) {
                        return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
                    }

                    // If product already in order, update qty & amount
                    $existingItem = Item::where('ord_id', $ordId)->where('prod_id', $prodId)->first();
                    if ($existingItem) {
                        $existingItem->update([
                            'item_qty'    => $existingItem->item_qty + $qty,
                            'item_amount' => (float)$existingItem->item_amount + $amount,
                        ]);
                        return response()->json([
                            'success' => true,
                            'message' => 'Product quantity updated in POS order',
                            'data'    => [
                                'order' => $order,
                                'item'  => $existingItem->fresh()
                            ]
                        ], 200);
                    }

                    // Add new item to existing order
                    $item = Item::create([
                        'ord_id'      => $ordId,
                        'prod_id'     => $prodId,
                        'item_qty'    => $qty,
                        'item_amount' => $amount,
                    ]);

                    return response()->json([
                        'success' => true,
                        'message' => 'Product added to existing POS order successfully',
                        'data'    => [
                            'order' => $order,
                            'item'  => array_merge($item->toArray(), ['prod_name' => $product->prod_name])
                        ]
                    ], 201);
                }

                // No ord_id — create a brand new anonymous POS order
                $order = Order::create([
                    'cust_id'       => null,
                    'ord_created'   => now(),
                    'ord_completed' => null,
                    'ord_tag'       => 'POS-' . strtoupper(Str::random(8)),
                    'ord_status'    => 'TO PROCESS',
                    'ord_rating'    => 0,
                    'ord_review'    => null,
                ]);

                $item = Item::create([
                    'ord_id'      => $order->ord_id,
                    'prod_id'     => $prodId,
                    'item_qty'    => $qty,
                    'item_amount' => $amount,
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'New POS order created and product added successfully',
                    'data'    => [
                        'order' => $order,
                        'item'  => array_merge($item->toArray(), ['prod_name' => $product->prod_name])
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to add product to POS order',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Checking out a POS order (in-store payment, always pickup)
            ----------
            JSON REQUEST

            ord_id - integer (req)
            pay_given - numeric (req)
            pay_ref - string (opt)
            appoint_id - integer (opt)
        */
        public function checkoutOrder(Request $json)
        {
            $validator = (new InputValidatorAPI())->posCheckoutOrder($json);
            if ($validator) return $validator;

            try {
                $ordId    = $json->input('ord_id');
                $payGiven = (float)$json->input('pay_given');

                $order = Order::with(['items.product'])->where('ord_id', $ordId)->first();
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
                }

                $totalDue = round((float)$order->items->sum('item_amount'), 2);

                if ($payGiven < $totalDue) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Insufficient payment. Total due is ' . number_format($totalDue, 2) . ', but ' . number_format($payGiven, 2) . ' was given.'
                    ], 400);
                }

                $payChange = round($payGiven - $totalDue, 2);
                $payRef    = $json->input('pay_ref') ?? ('POS-PAY-' . strtoupper(Str::random(8)));

                // 1. Create Payment record
                $payment = Payment::create([
                    'pay_created' => now(),
                    'pay_ref'     => $payRef,
                    'pay_given'   => $payGiven,
                    'pay_due'     => $totalDue,
                    'pay_change'  => $payChange,
                ]);

                // 2. Create Pickup record (POS is always in-store pickup)
                $appointId = $json->input('appoint_id');
                $pickup = Pickup::create([
                    'ord_id'           => $ordId,
                    'appoint_id'       => $appointId ?? null,
                    'pay_id'           => $payment->pay_id,
                    'pickup_created'   => now(),
                    'pickup_completed' => null,
                ]);

                // 3. Update order status
                $order->update([
                    'ord_status'    => 'TO CLAIM',
                    'ord_completed' => now(),
                ]);

                // 4. Deduct inventory stocks & update sales metrics
                foreach ($order->items as $item) {
                    $product = Product::where('prod_id', $item->prod_id)->first();
                    if ($product) {
                        $product->update([
                            'prod_qty'       => max(0, $product->prod_qty - $item->item_qty),
                            'prod_peaksold'  => (float)$product->prod_peaksold + (float)$item->item_amount,
                            'prod_todaysold' => (float)$product->prod_todaysold + (float)$item->item_amount,
                        ]);
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => 'POS order checked out successfully',
                    'data' => [
                        'payment'   => $payment,
                        'pickup_id' => $pickup->pickup_id,
                        'order'     => $order->fresh(),
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to checkout POS order',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating POS order details
            ----------
            JSON REQUEST

            ord_id - integer (req)
            ord_tag - string (opt)
            ord_status - string (opt)
            ord_rating - integer (opt)
            ord_review - string (opt)
            ord_completed - string/datetime (opt)
        */
        public function updateOrderDetails(Request $json)
        {
            $validator = (new InputValidatorAPI())->posUpdateOrderDetails($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $order = Order::where('ord_id', $ordId)->first();

                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
                }

                // Only update fields that were sent in the request
                $updatable = [];
                if ($json->has('ord_tag'))       $updatable['ord_tag']       = $json->input('ord_tag');
                if ($json->has('ord_status'))    $updatable['ord_status']    = $json->input('ord_status');
                if ($json->has('ord_rating'))    $updatable['ord_rating']    = (int)$json->input('ord_rating');
                if ($json->has('ord_review'))    $updatable['ord_review']    = $json->input('ord_review');
                if ($json->has('ord_completed')) $updatable['ord_completed'] = $json->input('ord_completed');

                if (empty($updatable)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'No updatable fields provided'
                    ], 400);
                }

                $order->update($updatable);

                return response()->json([
                    'success' => true,
                    'message' => 'POS order details updated successfully',
                    'data'    => $order->fresh()
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update POS order details',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Removing a product from a POS order
            ----------
            JSON REQUEST

            ord_id - integer (req)
            prod_id - integer (req)
        */
        public function removeProductFromOrder(Request $json)
        {
            $validator = (new InputValidatorAPI())->removeProductFromOrder($json);
            if ($validator) return $validator;

            try {
                $ordId  = $json->input('ord_id');
                $prodId = $json->input('prod_id');

                $order = Order::where('ord_id', $ordId)->first();
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
                }

                $item = Item::where('ord_id', $ordId)->where('prod_id', $prodId)->first();
                if (!$item) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product not found in this POS order'
                    ], 404);
                }

                $item->delete();

                return response()->json([
                    'success' => true,
                    'message' => 'Product removed from POS order successfully',
                    'data' => [
                        'ord_id'  => $ordId,
                        'prod_id' => $prodId,
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to remove product from POS order',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }
    }
