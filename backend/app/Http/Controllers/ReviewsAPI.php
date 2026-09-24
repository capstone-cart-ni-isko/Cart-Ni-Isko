<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Item;
    use App\Models\Order;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;

    class ReviewsAPI extends Controller
    {
        // Review moderation markers stored inside orders.ord_review so the
        // approval state travels with the row (no schema change needed)
        protected const PENDING  = '[PENDING] ';
        protected const APPROVED = '[APPROVED] ';

        // Order statuses that do not represent a completed purchase: a cart
        // order that was never checked out, or one that was cancelled
        protected const NOT_PURCHASED = ['TO PROCESS', 'CANCELLED'];

        // True when an order status proves the customer actually bought it
        protected function countsAsPurchase($status): bool
        {
            return !in_array(strtoupper(trim((string) $status)), self::NOT_PURCHASED, true);
        }

        // Splits a stored review into its marker and visible body
        protected function splitReview(?string $review): array
        {
            $review = (string) $review;

            if (str_starts_with($review, self::PENDING)) {
                return ['status' => 'PENDING', 'body' => substr($review, strlen(self::PENDING))];
            }
            if (str_starts_with($review, self::APPROVED)) {
                return ['status' => 'APPROVED', 'body' => substr($review, strlen(self::APPROVED))];
            }
            if ($review === '[REVIEW CENSORED]') {
                return ['status' => 'CENSORED', 'body' => $review];
            }

            // Reviews written before markers existed count as approved
            return ['status' => 'APPROVED', 'body' => $review];
        }

        // The customer account behind the bearer token, or a 403 response
        protected function requireCustomer(Request $json)
        {
            $user = $json->user();
            if (!$user instanceof Customer) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only customer accounts may submit reviews'
                ], 403);
            }

            return $user;
        }

        /*
            Creating product reviews
            ----------
            JSON REQUEST

            ord_id - integer (req: one of ord_id / prod_id)
            prod_id - integer (req: one of ord_id / prod_id)
            ord_rating - integer (req: 1-5)
            ord_review - string (opt)
        */
        public function createReview(Request $json)
        {
            $validator = (new InputValidatorAPI())->createReview($json);
            if ($validator) return $validator;

            // Reviews are customer-only and always tied to the token owner
            $customer = $this->requireCustomer($json);
            if ($customer instanceof \Illuminate\Http\JsonResponse) return $customer;

            try {
                $ordId = $json->input('ord_id');
                $prodId = $json->input('prod_id');
                $rating = (int) $json->input('ord_rating');
                $review = (string) $json->input('ord_review', '');

                if ($ordId) {
                    $order = Order::where('ord_id', $ordId)->first();
                    if (!$order) {
                        return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                    }

                    // Only the purchaser may review their own order
                    if ((int) $order->cust_id !== (int) $customer->getKey()) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review your own orders'
                        ], 403);
                    }

                    // Purchase rule: a review is only allowed once the order
                    // was actually paid for (still-in-cart and cancelled
                    // orders never count as a purchase)
                    if (!$this->countsAsPurchase($order->ord_status)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased'
                        ], 403);
                    }

                    // One review per order - edits go through updateReview
                    if ((int) $order->ord_rating > 0) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You have already reviewed this order. Please edit your existing review instead.'
                        ], 409);
                    }

                    if ($prodId && !Item::where('ord_id', $order->ord_id)->where('prod_id', $prodId)->exists()) {
                        return response()->json([
                            'success' => false,
                            'message' => 'The requested product is not part of this order'
                        ], 403);
                    }

                    $targetProdId = $prodId ?: optional(Item::where('ord_id', $order->ord_id)->first())->prod_id;

                    // REQ-APC-2: one rating / one feedback entry per product
                    if ($targetProdId && Item::join('orders', 'orders.ord_id', '=', 'items.ord_id')
                        ->where('orders.cust_id', $customer->getKey())
                        ->where('items.prod_id', $targetProdId)
                        ->where('orders.ord_rating', '>', 0)
                        ->exists()) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You have already reviewed this product. Please edit your existing review instead.'
                        ], 409);
                    }
                } else {
                    // Product-only submission: verify the customer purchased it
                    $purchased = Item::join('orders', 'orders.ord_id', '=', 'items.ord_id')
                        ->where('orders.cust_id', $customer->getKey())
                        ->where('items.prod_id', $prodId)
                        ->whereNotIn('orders.ord_status', self::NOT_PURCHASED)
                        ->exists();

                    if (!$purchased) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased'
                        ], 403);
                    }

                    // REQ-APC-2: one rating / one feedback entry per product
                    $existing = Item::join('orders', 'orders.ord_id', '=', 'items.ord_id')
                        ->where('orders.cust_id', $customer->getKey())
                        ->where('items.prod_id', $prodId)
                        ->where('orders.ord_rating', '>', 0)
                        ->exists();

                    if ($existing) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You have already reviewed this product. Please edit your existing review instead.'
                        ], 409);
                    }

                    $order = Item::join('orders', 'orders.ord_id', '=', 'items.ord_id')
                        ->where('orders.cust_id', $customer->getKey())
                        ->where('items.prod_id', $prodId)
                        ->whereNotIn('orders.ord_status', self::NOT_PURCHASED)
                        ->orderByDesc('orders.ord_created')
                        ->select('orders.*')
                        ->first();

                    if (!$order) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased'
                        ], 403);
                    }

                    $targetProdId = $prodId;
                }

                // REQ-APC-1: every submission waits for employee approval
                $updated = DB::table('orders')
                    ->where('ord_id', $order->ord_id)
                    ->update([
                        'ord_rating' => $rating,
                        'ord_review' => self::PENDING . $review,
                    ]);

                if (!$updated) {
                    return response()->json(['success' => false, 'message' => 'Order not found or rating unchanged'], 404);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review and rating submitted successfully',
                    'data' => [
                        'ord_id'   => $order->ord_id,
                        'prod_id'  => $targetProdId,
                        'ord_rating' => $rating,
                        'ord_review' => $review,
                        'status'   => 'PENDING',
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create review',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Deleting product reviews
            ----------
            JSON REQUEST

            ord_id - integer (req)
        */
        public function deleteReview(Request $json)
        {
            $validator = (new InputValidatorAPI())->deleteReview($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $order = DB::table('orders')->where('ord_id', $ordId)->first();

                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order review not found'], 404);
                }

                // The owning customer or an employee may clear the review
                $user = $json->user();
                $ownsOrder = $user instanceof Customer && (int) $order->cust_id === (int) $user->getKey();
                if (!$ownsOrder && !$this->isEmployee($user)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You may only delete your own reviews'
                    ], 403);
                }

                DB::table('orders')->where('ord_id', $ordId)->update([
                    'ord_rating' => 0,
                    'ord_review' => null,
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Review deleted successfully'
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to delete review',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying product reviews
            ----------
            JSON REQUEST / Query Params

            prod_id - integer (opt)
            status - string (opt: pending | approved, employees only)
        */
        public function displayReviews(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = DB::table('orders')
                    ->join('items', 'orders.ord_id', '=', 'items.ord_id')
                    ->where('orders.ord_rating', '>', 0)
                    ->whereNotNull('orders.ord_review');

                if ($prodId) {
                    $query->where('items.prod_id', $prodId);
                }

                $rows = $query->select(
                    'orders.ord_id',
                    'orders.cust_id',
                    'orders.ord_rating',
                    'orders.ord_review',
                    'orders.ord_completed',
                    'items.prod_id'
                )->distinct()->get();

                // Staff may ask for the moderation queue; guests only ever
                // see reviews an employee already approved (REQ-APC-1)
                $statusFilter = strtolower((string) $json->input('status', ''));
                $wantsQueue = in_array($statusFilter, ['pending', 'approved'], true)
                    && $this->isEmployee($json->user());

                $reviews = $rows->map(function ($row) use ($wantsQueue, $statusFilter) {
                    $split = $this->splitReview($row->ord_review);

                    if (!$wantsQueue && $split['status'] !== 'APPROVED') {
                        return null;
                    }
                    if ($wantsQueue && strtolower($split['status']) !== $statusFilter) {
                        return null;
                    }

                    $row->ord_review = $split['body'];
                    $row->status = $split['status'];

                    return $row;
                })->filter()->values();

                return response()->json([
                    'success' => true,
                    'message' => 'Product reviews retrieved successfully',
                    'data' => $reviews
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display reviews',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Moderating product reviews
            ----------
            JSON REQUEST

            ord_id - integer (req)
            censored_review - string (opt)
            approve - boolean (opt, default: true)
        */
        public function moderateReview(Request $json)
        {
            $validator = (new InputValidatorAPI())->moderateReview($json);
            if ($validator) return $validator;

            // Only employees review submissions before they go public
            $denied = $this->requireEmployee($json);
            if ($denied) return $denied;

            try {
                $ordId = $json->input('ord_id');
                $approve = $json->input('approve', true);
                $reviewText = $json->input('censored_review');

                $order = DB::table('orders')->where('ord_id', $ordId)->first();
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                $current = $this->splitReview($order->ord_review);

                if (!$approve) {
                    DB::table('orders')->where('ord_id', $ordId)->update(['ord_review' => '[REVIEW CENSORED]']);
                    $newStatus = 'CENSORED';
                    $notice = 'Your review for order ' . $order->ord_tag . ' was not approved and has been censored.';
                } else {
                    $body = $reviewText !== null ? (string) $reviewText : $current['body'];
                    DB::table('orders')->where('ord_id', $ordId)->update(['ord_review' => self::APPROVED . $body]);
                    $newStatus = 'APPROVED';
                    $notice = 'Your review for order ' . $order->ord_tag . ' has been approved.';
                }

                if ($order->cust_id) {
                    $this->notifyCustomer((int) $order->cust_id, $notice);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review moderation completed',
                    'data' => [
                        'ord_id'  => $order->ord_id,
                        'status'  => $newStatus,
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to moderate review',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Scoring product ratings
            ----------
            JSON REQUEST / Query Params

            prod_id - integer (opt)
        */
        public function scoreRating(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = DB::table('orders')
                    ->join('items', 'orders.ord_id', '=', 'items.ord_id')
                    ->where('orders.ord_rating', '>', 0)
                    ->whereNotNull('orders.ord_review');

                if ($prodId) {
                    $query->where('items.prod_id', $prodId);
                }

                // Only approved feedback contributes to the public score
                $approved = $query->where('orders.ord_review', 'like', self::APPROVED . '%');

                $avgScore = (clone $approved)->avg('orders.ord_rating');
                $totalReviews = (clone $approved)->count();

                return response()->json([
                    'success' => true,
                    'message' => 'Rating score calculated successfully',
                    'data' => [
                        'prod_id' => $prodId,
                        'average_rating' => round((float)$avgScore, 2),
                        'total_reviews' => $totalReviews,
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to calculate score rating',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating product reviews
            ----------
            JSON REQUEST

            ord_id - integer (req)
            ord_rating - integer (opt)
            ord_review - string (opt)
        */
        public function updateReview(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateReview($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $order = DB::table('orders')->where('ord_id', $ordId)->first();

                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                // Only the owning customer may edit their feedback
                $user = $json->user();
                if (!$user instanceof Customer || (int) $order->cust_id !== (int) $user->getKey()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You may only edit your own reviews'
                    ], 403);
                }

                // REQ-APC-2: editing stops once an employee approved it
                $split = $this->splitReview($order->ord_review);
                if ($split['status'] === 'APPROVED' || $split['status'] === 'CENSORED') {
                    return response()->json([
                        'success' => false,
                        'message' => 'Approved reviews can no longer be edited'
                    ], 409);
                }

                $updateData = [];
                if ($json->has('ord_rating')) $updateData['ord_rating'] = (int) $json->input('ord_rating');
                if ($json->has('ord_review')) $updateData['ord_review'] = self::PENDING . (string) $json->input('ord_review');

                if (empty($updateData)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'No updatable fields provided'
                    ], 400);
                }

                $updated = DB::table('orders')->where('ord_id', $ordId)->update($updateData);

                if (!$updated) {
                    return response()->json(['success' => false, 'message' => 'Order not found or no fields changed'], 404);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review updated successfully',
                    'data' => [
                        'ord_id' => $ordId,
                        'status' => 'PENDING',
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update review',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }
