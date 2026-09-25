<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Item;
    use App\Models\Order;
    use App\Models\Product;
    use App\Models\Wishlist;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;

    class WishlistAPI extends Controller
    {
        /*
            Adding wishlist items
            ----------
            JSON REQUEST

            cust_id - integer (req)
            prod_id - integer or string prod_tag (req)
            item_qty - integer (opt, default: 1)
            item_amount - numeric (opt)
        */
        public function addWishlistItem(Request $json)
        {
            $validator = (new InputValidatorAPI())->addWishlistItem($json);
            if ($validator) return $validator;

            try {
                $custId = $this->customerId($json);
                if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Customer account mismatch.',
                    ], 403);
                }
                $prodId = $json->input('prod_id');
                $itemQty = max(1, (int) $json->input('item_qty', 1));

                $customer = Customer::where('cust_id', $custId)->first();
                if (!$customer) {
                    return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
                }

                // Only these two columns are read below - skip the heavy
                // review/detail JSON blobs on this lookup.
                $product = is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->first(['prod_id', 'prod_price'])
                    : Product::where('prod_tag', $prodId)->first(['prod_id', 'prod_price']);

                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $resolvedProdId = $product->prod_id;
                $itemAmount = round((float) $product->prod_price * (int) $itemQty, 2);

                // Check if already in wishlist; update or insert
                $existing = Wishlist::where('cust_id', $custId)->where('prod_id', $resolvedProdId)->first();

                if ($existing) {
                    Wishlist::where('cust_id', $custId)
                        ->where('prod_id', $resolvedProdId)
                        ->update([
                            'item_qty' => $existing->item_qty + $itemQty,
                            'item_amount' => $existing->item_amount + $itemAmount
                        ]);
                } else {
                    Wishlist::create([
                        'cust_id'     => $custId,
                        'prod_id'     => $resolvedProdId,
                        'item_qty'    => $itemQty,
                        'item_amount' => $itemAmount
                    ]);
                    $customer->increment('cust_wishlist');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Item added to wishlist successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'prod_id' => $resolvedProdId,
                        'cust_wishlist_count' => $customer->fresh()->cust_wishlist,
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to add wishlist item',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Adding wishlist items to orders
            ----------
            JSON REQUEST

            cust_id - integer (req)
            prod_id - integer or string prod_tag (req)
            item_qty - integer (opt, default: 1)
        */
        public function addWishlistToOrder(Request $json)
        {
            $validator = (new InputValidatorAPI())->addWishlistToOrder($json);
            if ($validator) return $validator;

            try {
                $custId = $this->customerId($json);
                if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Customer account mismatch.',
                    ], 403);
                }
                $prodId = $json->input('prod_id');
                $qty = $json->input('item_qty', 1);

                // Only these three columns are read below - skip the heavy
                // review/detail JSON blobs on this lookup.
                $product = is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->first(['prod_id', 'prod_price', 'prod_disabled', 'prod_deleted'])
                    : Product::where('prod_tag', $prodId)->first(['prod_id', 'prod_price', 'prod_disabled', 'prod_deleted']);

                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                if ($product->prod_disabled || $product->prod_deleted) {
                    return response()->json(['success' => false, 'message' => 'Product is no longer offered'], 400);
                }

                $resolvedProdId = $product->prod_id;
                $wishlistItem = Wishlist::where('cust_id', $custId)
                    ->where('prod_id', $resolvedProdId)
                    ->first();
                if (! $wishlistItem) {
                    return response()->json(['success' => false, 'message' => 'Wishlist item not found.'], 404);
                }

                $created = DB::transaction(function () use ($custId, $resolvedProdId, $product, $qty) {
                    $customer = Customer::lockForUpdate()->findOrFail($custId);
                    $order = Order::where('cust_id', $custId)
                        ->where('ord_tag', 'like', 'CART-%')
                        ->lockForUpdate()
                        ->first();
                    $createdOrder = $order === null;
                    if (! $order) {
                        $order = Order::create([
                            'cust_id' => $custId,
                            'ord_created' => now(),
                            'ord_completed' => null,
                            'ord_tag' => 'CART-' . strtoupper(\Illuminate\Support\Str::random(8)),
                            'ord_status' => 'TO PROCESS',
                            'ord_rating' => 0,
                            'ord_review' => null,
                        ]);
                    }

                    $item = Item::where('ord_id', $order->ord_id)
                        ->where('prod_id', $resolvedProdId)
                        ->lockForUpdate()
                        ->first();
                    if ($item) {
                        $item->update([
                            'item_qty' => $item->item_qty + $qty,
                            'item_amount' => round((float) $item->item_amount + (float) $product->prod_price * $qty, 2),
                        ]);
                    } else {
                        $item = Item::create([
                            'ord_id' => $order->ord_id,
                            'prod_id' => $resolvedProdId,
                            'item_qty' => $qty,
                            'item_amount' => round((float) $product->prod_price * $qty, 2),
                        ]);
                    }

                    if ($createdOrder) {
                        $customer->increment('cust_cart');
                    }

                    // Wishlist and cart membership are intentionally independent.
                    return [$order, $item];
                });

                return response()->json([
                    'success' => true,
                    'message' => 'Wishlist item transferred to cart successfully',
                    'data' => [
                        'order' => $created[0],
                        'item' => $created[1],
                    ],
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
            Displaying products from wishlist
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

                // Existence check only: an EXISTS probe avoids hydrating the
                // whole customer row on every wishlist fetch.
                if (!Customer::where('cust_id', $custId)->exists()) {
                    return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
                }

                $items = Wishlist::with('product')->where('cust_id', $custId)->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Wishlist retrieved successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'wishlist_count' => $items->count(),
                        'items' => $items
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
            Removing wishlist items
            ----------
            JSON REQUEST

            cust_id - integer (req)
            prod_id - integer or string prod_tag (req)
        */
        public function removeWishlistItem(Request $json)
        {
            $validator = (new InputValidatorAPI())->removeWishlistItem($json);
            if ($validator) return $validator;

            try {
                $custId = $this->customerId($json);
                if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Customer account mismatch.',
                    ], 403);
                }
                $prodId = $json->input('prod_id');

                // Resolve the id with a single-column lookup instead of
                // hydrating the whole product row (incl. the review blobs).
                $resolvedProdId = (is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->value('prod_id')
                    : Product::where('prod_tag', $prodId)->value('prod_id'))
                    ?? $prodId;

                $deleted = Wishlist::where('cust_id', $custId)
                    ->where('prod_id', $resolvedProdId)
                    ->delete();

                if ($deleted) {
                    $customer = Customer::where('cust_id', $custId)->first();
                    if ($customer && $customer->cust_wishlist > 0) {
                        $customer->decrement('cust_wishlist');
                    }
                }

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
            Updating wishlist items
            ----------
            JSON REQUEST

            cust_id - integer (req)
            prod_id - integer or string prod_tag (req)
            item_qty - integer (opt)
            item_amount - numeric (opt)
        */
        public function updateWishlistItem(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateWishlistItem($json);
            if ($validator) return $validator;

            try {
                $custId = $this->customerId($json);
                if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Customer account mismatch.',
                    ], 403);
                }
                $prodId = $json->input('prod_id');

                $product = is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->first(['prod_id', 'prod_price'])
                    : Product::where('prod_tag', $prodId)->first(['prod_id', 'prod_price']);
                if (! $product) {
                    return response()->json(['success' => false, 'message' => 'Product not found.'], 404);
                }
                $resolvedProdId = $product->prod_id;

                $updateData = [];
                if ($json->has('item_qty')) {
                    $quantity = max(1, (int) $json->input('item_qty'));
                    $updateData = [
                        'item_qty' => $quantity,
                        'item_amount' => round((float) $product->prod_price * $quantity, 2),
                    ];
                }

                if (! empty($updateData)) {
                    Wishlist::where('cust_id', $custId)->where('prod_id', $resolvedProdId)->update($updateData);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Wishlist item details updated successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'prod_id' => $resolvedProdId,
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
    }

