<?php

    namespace App\Http\Controllers;

    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;

    class ReviewsAPI extends Controller
    {
        /*
            Creating product reviews
            ----------
            JSON REQUEST

            ord_id - integer (req)
            ord_rating - integer (req: 1-5)
            ord_review - string (opt)
        */
        public function createReview(Request $json)
        {
            $validator = (new InputValidatorAPI())->createReview($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $rating = $json->input('ord_rating');
                $review = $json->input('ord_review', '');

                $updated = DB::table('orders')
                    ->where('ord_id', $ordId)
                    ->update([
                        'ord_rating' => $rating,
                        'ord_review' => $review,
                    ]);

                if (!$updated) {
                    return response()->json(['success' => false, 'message' => 'Order not found or rating unchanged'], 404);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review and rating submitted successfully'
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

                $updated = DB::table('orders')
                    ->where('ord_id', $ordId)
                    ->update([
                        'ord_rating' => 0,
                        'ord_review' => null,
                    ]);

                if (!$updated) {
                    return response()->json(['success' => false, 'message' => 'Order review not found'], 404);
                }

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
            JSON REQUEST

            prod_id - integer (opt)
        */
        public function displayReviews(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = DB::table('orders')
                    ->join('items', 'orders.ord_id', '=', 'items.ord_id')
                    ->where('orders.ord_rating', '>', 0);

                if ($prodId) {
                    $query->where('items.prod_id', $prodId);
                }

                $reviews = $query->select(
                    'orders.ord_id',
                    'orders.cust_id',
                    'orders.ord_rating',
                    'orders.ord_review',
                    'orders.ord_completed',
                    'items.prod_id'
                )->distinct()->get();

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

            try {
                $ordId = $json->input('ord_id');
                $approve = $json->input('approve', true);
                $reviewText = $json->input('censored_review');

                $order = DB::table('orders')->where('ord_id', $ordId)->first();
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                if (!$approve) {
                    DB::table('orders')->where('ord_id', $ordId)->update(['ord_review' => '[REVIEW CENSORED]']);
                } else if ($reviewText !== null) {
                    DB::table('orders')->where('ord_id', $ordId)->update(['ord_review' => $reviewText]);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review moderation completed'
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
            JSON REQUEST

            prod_id - integer (opt)
        */
        public function scoreRating(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = DB::table('orders')
                    ->join('items', 'orders.ord_id', '=', 'items.ord_id')
                    ->where('orders.ord_rating', '>', 0);

                if ($prodId) {
                    $query->where('items.prod_id', $prodId);
                }

                $avgScore = $query->avg('orders.ord_rating');
                $totalReviews = $query->count();

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
                $updateData = [];

                if ($json->has('ord_rating')) $updateData['ord_rating'] = $json->input('ord_rating');
                if ($json->has('ord_review')) $updateData['ord_review'] = $json->input('ord_review');

                $updated = DB::table('orders')->where('ord_id', $ordId)->update($updateData);

                if (!$updated) {
                    return response()->json(['success' => false, 'message' => 'Order not found or no fields changed'], 404);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review updated successfully'
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
