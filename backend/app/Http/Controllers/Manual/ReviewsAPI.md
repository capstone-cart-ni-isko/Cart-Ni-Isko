# ReviewsAPI Manual

How to test and use all methods in `ReviewsAPI.php`.

---

## 1. Create Review (`createReview`)

### What it does
Submits a rating and optional text review for a completed order.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/reviews/create`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 3,
  "ord_rating": 5,
  "ord_review": "Great product, fast delivery!"
}
```

### Flow
1. Validate that `ord_id` and `ord_rating` (1–5) are provided.
2. Find the order in the `orders` table.
3. If not found → return `404`.
4. Save the rating and review text to the order row.
5. Return success.

---

## 2. Delete Review (`deleteReview`)

### What it does
Removes a review from an order. Resets the rating to `0` and clears the review text.

### Postman Setup
- **Method**: `DELETE`
- **URL**: `http://localhost:8000/api/reviews/delete`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 3
}
```

### Flow
1. Validate that `ord_id` is provided.
2. Find the order.
3. If not found → return `404`.
4. Set `ord_rating` to `0` and `ord_review` to `null`.
5. Return success.

---

## 3. Display Reviews (`displayReviews`)

### What it does
Shows all reviews. You can filter by product ID.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/reviews/display?prod_id=2`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Description |
|---|---|---|
| `prod_id` | No | Show only reviews for this product |

### Flow
1. Join `orders` with `items` to link reviews to products.
2. Only include orders where `ord_rating` is greater than `0`.
3. If `prod_id` is given → filter by that product.
4. Return the list of reviews with order ID, customer ID, rating, review text, and product ID.

---

## 4. Moderate Review (`moderateReview`)

### What it does
Lets an admin censor or edit a review. If `approve` is `false`, the review text becomes `[REVIEW CENSORED]`. If `approve` is `true` and a `censored_review` text is given, it replaces the review.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/reviews/moderate`
- **Headers**: `Content-Type: application/json`

### JSON Body (Censor)
```json
{
  "ord_id": 3,
  "approve": false
}
```

### JSON Body (Edit)
```json
{
  "ord_id": 3,
  "approve": true,
  "censored_review": "Review text edited by admin."
}
```

### Flow
1. Validate that `ord_id` is provided.
2. Find the order.
3. If not found → return `404`.
4. If `approve` is `false` → replace review text with `[REVIEW CENSORED]`.
5. If `approve` is `true` and `censored_review` is given → update review text.
6. Return success.

---

## 5. Score Rating (`scoreRating`)

### What it does
Calculates the average star rating and total number of reviews for a product (or all products).

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/reviews/score?prod_id=2`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Description |
|---|---|---|
| `prod_id` | No | Calculate score for this product only |

### Flow
1. Join `orders` with `items`.
2. Only count orders with a rating greater than `0`.
3. If `prod_id` is given → filter by that product.
4. Calculate the average rating (rounded to 2 decimal places).
5. Count the total number of reviews.
6. Return `average_rating` and `total_reviews`.

### Sample Success Response
```json
{
  "success": true,
  "message": "Rating score calculated successfully",
  "data": {
    "prod_id": 2,
    "average_rating": 4.25,
    "total_reviews": 8
  }
}
```

---

## 6. Update Review (`updateReview`)

### What it does
Edits an existing review's rating and/or text.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/reviews/update`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 3,
  "ord_rating": 4,
  "ord_review": "Actually, it was good but not perfect."
}
```

### Flow
1. Validate that `ord_id` is provided.
2. Find the order.
3. If not found → return `404`.
4. Update only the fields that were sent (`ord_rating`, `ord_review`).
5. Return success.
