<?php

    namespace App\Http\Controllers;

    use App\Models\Item;
    use App\Models\Order;
    use App\Models\Product;
    use Illuminate\Http\Request;

    class OrdersAPI extends Controller
    {
        /*
            Adding products to an existing order
            ----------
            JSON REQUEST

            ord_id - integer (req)
            prod_id - integer (req)
            item_qty - integer (opt, default: 1)
            item_amount - numeric (opt)
        */
        public function addProductToOrder(Request $json)
        {
            $validator = (new InputValidatorAPI())->addProductToOrder($json);
            if ($validator) return $validator;

            try {
                $ordId  = $json->input('ord_id');
                $prodId = $json->input('prod_id');

                // Verify order exists
                $order = Order::where('ord_id', $ordId)->first();
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

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

                // Check if product already exists in the order — if so, update qty & amount
                $existingItem = Item::where('ord_id', $ordId)->where('prod_id', $prodId)->first();
                if ($existingItem) {
                    $newQty    = $existingItem->item_qty + $qty;
                    $newAmount = (float)$existingItem->item_amount + $amount;
                    $existingItem->update([
                        'item_qty'    => $newQty,
                        'item_amount' => $newAmount,
                    ]);

                    return response()->json([
                        'success' => true,
                        'message' => 'Product quantity updated in order successfully',
                        'data'    => $existingItem->fresh()
                    ], 200);
                }

                // Create new item record
                $item = Item::create([
                    'ord_id'      => $ordId,
                    'prod_id'     => $prodId,
                    'item_qty'    => $qty,
                    'item_amount' => $amount,
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Product added to order successfully',
                    'data'    => array_merge($item->toArray(), ['prod_name' => $product->prod_name])
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to add product to order',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating order details
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
            $validator = (new InputValidatorAPI())->updateOrderDetails($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $order = Order::where('ord_id', $ordId)->first();

                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
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
                    'message' => 'Order details updated successfully',
                    'data'    => $order->fresh()
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update order details',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Removing a product from an existing order
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

                // Verify order exists
                $order = Order::where('ord_id', $ordId)->first();
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                // Verify item exists in the order
                $item = Item::where('ord_id', $ordId)->where('prod_id', $prodId)->first();
                if (!$item) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product not found in this order'
                    ], 404);
                }

                $item->delete();

                return response()->json([
                    'success' => true,
                    'message' => 'Product removed from order successfully',
                    'data' => [
                        'ord_id'  => $ordId,
                        'prod_id' => $prodId,
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to remove product from order',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }
    }
