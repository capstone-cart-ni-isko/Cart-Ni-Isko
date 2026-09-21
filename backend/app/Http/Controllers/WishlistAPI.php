<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Product;
    use App\Models\Wishlist;
    use Illuminate\Http\Request;

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
                $custId = $json->input('cust_id');
                $prodId = $json->input('prod_id');
                $itemQty = $json->input('item_qty', 1);
                $itemAmount = $json->input('item_amount', null);

                $customer = Customer::where('cust_id', $custId)->first();
                if (!$customer) {
                    return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
                }

                $product = is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->first()
                    : Product::where('prod_tag', $prodId)->first();

                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $resolvedProdId = $product->prod_id;
                if ($itemAmount === null) {
                    $itemAmount = $product->prod_price * $itemQty;
                }

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
                $custId = $json->input('cust_id');
                $prodId = $json->input('prod_id');
                $qty = $json->input('item_qty', 1);

                $product = is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->first()
                    : Product::where('prod_tag', $prodId)->first();

                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                if ($product->prod_disabled || $product->prod_deleted) {
                    return response()->json(['success' => false, 'message' => 'Product is no longer offered'], 400);
                }

                $resolvedProdId = $product->prod_id;

                Wishlist::where('cust_id', $custId)->where('prod_id', $resolvedProdId)->delete();

                $customer = Customer::where('cust_id', $custId)->first();
                if ($customer && $customer->cust_wishlist > 0) {
                    $customer->decrement('cust_wishlist');
                    $customer->increment('cust_cart');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Wishlist item transferred to order/cart successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'prod_id' => $resolvedProdId,
                        'qty'     => $qty,
                    ]
                ], 200);

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
                $custId = $json->input('cust_id');
                if (!$custId) {
                    return response()->json(['success' => false, 'message' => 'Customer ID is required'], 400);
                }

                $customer = Customer::where('cust_id', $custId)->first();
                if (!$customer) {
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
                $custId = $json->input('cust_id');
                $prodId = $json->input('prod_id');

                $product = is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->first()
                    : Product::where('prod_tag', $prodId)->first();

                $resolvedProdId = $product ? $product->prod_id : $prodId;

                Wishlist::where('cust_id', $custId)->where('prod_id', $resolvedProdId)->delete();

                $customer = Customer::where('cust_id', $custId)->first();
                if ($customer && $customer->cust_wishlist > 0) {
                    $customer->decrement('cust_wishlist');
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
                $custId = $json->input('cust_id');
                $prodId = $json->input('prod_id');

                $product = is_numeric($prodId)
                    ? Product::where('prod_id', $prodId)->first()
                    : Product::where('prod_tag', $prodId)->first();

                $resolvedProdId = $product ? $product->prod_id : $prodId;

                $updateData = [];
                if ($json->has('item_qty')) $updateData['item_qty'] = $json->input('item_qty');
                if ($json->has('item_amount')) $updateData['item_amount'] = $json->input('item_amount');

                if (!empty($updateData)) {
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

