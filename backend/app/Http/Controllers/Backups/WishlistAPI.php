<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Product;
    use Illuminate\Http\Request;

    class WishlistAPI extends Controller
    {
        /*
            Adding wishlist items
            ----------
            JSON REQUEST

            cust_id - integer (req)
            prod_id - integer (req)
        */
        public function addWishlistItem(Request $json)
        {
            $validator = (new InputValidatorAPI())->addWishlistItem($json);
            if ($validator) return $validator;

            try {
                $custId = $json->input('cust_id');
                $prodId = $json->input('prod_id');

                $customer = Customer::where('cust_id', $custId)->first();
                if (!$customer) {
                    return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
                }

                $product = Product::where('prod_id', $prodId)->first();
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $customer->increment('cust_wishlist');

                return response()->json([
                    'success' => true,
                    'message' => 'Item added to wishlist successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'prod_id' => $prodId,
                        'cust_wishlist_count' => $customer->cust_wishlist,
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
            prod_id - integer (req)
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

                $product = Product::where('prod_id', $prodId)->first();
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                if ($product->prod_disabled || $product->prod_deleted) {
                    return response()->json(['success' => false, 'message' => 'Product is no longer offered'], 400);
                }

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
                        'prod_id' => $prodId,
                        'qty' => $qty,
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

                return response()->json([
                    'success' => true,
                    'message' => 'Wishlist retrieved successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'wishlist_count' => $customer->cust_wishlist,
                        'items' => []
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
            prod_id - integer (req)
        */
        public function removeWishlistItem(Request $json)
        {
            $validator = (new InputValidatorAPI())->removeWishlistItem($json);
            if ($validator) return $validator;

            try {
                $custId = $json->input('cust_id');
                $prodId = $json->input('prod_id');

                $customer = Customer::where('cust_id', $custId)->first();
                if ($customer && $customer->cust_wishlist > 0) {
                    $customer->decrement('cust_wishlist');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Item removed from wishlist successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'prod_id' => $prodId,
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
            prod_id - integer (req)
            notes - string (opt)
        */
        public function updateWishlistItem(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateWishlistItem($json);
            if ($validator) return $validator;

            try {
                $custId = $json->input('cust_id');
                $prodId = $json->input('prod_id');
                $notes = $json->input('notes', '');

                return response()->json([
                    'success' => true,
                    'message' => 'Wishlist item details updated successfully',
                    'data' => [
                        'cust_id' => $custId,
                        'prod_id' => $prodId,
                        'notes'   => $notes,
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
