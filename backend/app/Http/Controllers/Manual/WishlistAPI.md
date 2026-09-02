# WishlistAPI Manual

How to test and use all methods in `WishlistAPI.php`.

---

## 1. Add Wishlist Item (`addWishlistItem`)

### What it does
Adds a product to a customer's wishlist.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/wishlist/add`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "cust_id": 1,
  "prod_id": 5
}
```

### Flow
1. Validate that `cust_id` and `prod_id` are provided.
2. Check if the customer exists. If not → return `404`.
3. Check if the product exists. If not → return `404`.
4. Add 1 to the customer's `cust_wishlist` count.
5. Return success with the updated wishlist count.

---

## 2. Add Wishlist Item to Order (`addWishlistToOrder`)

### What it does
Moves a wishlist item into the customer's cart/order.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/wishlist/to_order`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "cust_id": 1,
  "prod_id": 5,
  "item_qty": 2
}
```

### Flow
1. Validate that `cust_id` and `prod_id` are provided.
2. Find the product. If not found → return `404`.
3. Check if the product is still available (not disabled or deleted). If unavailable → return `400`.
4. Subtract 1 from customer's `cust_wishlist` count.
5. Add 1 to customer's `cust_cart` count.
6. Return success.

### Notes
- `item_qty` defaults to `1` if not provided.

---

## 3. Display Wishlist (`displayWishlist`)

### What it does
Shows the wishlist for a specific customer.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/wishlist/display?cust_id=1`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Description |
|---|---|---|
| `cust_id` | Yes | The customer's ID |

### Flow
1. Check that `cust_id` is provided. If not → return `400`.
2. Find the customer. If not found → return `404`.
3. Return the customer's wishlist count and items.

---

## 4. Remove Wishlist Item (`removeWishlistItem`)

### What it does
Removes a product from the customer's wishlist.

### Postman Setup
- **Method**: `DELETE`
- **URL**: `http://localhost:8000/api/wishlist/remove`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "cust_id": 1,
  "prod_id": 5
}
```

### Flow
1. Validate that `cust_id` and `prod_id` are provided.
2. Find the customer.
3. If the wishlist count is greater than `0`, subtract 1.
4. Return success.

---

## 5. Update Wishlist Item (`updateWishlistItem`)

### What it does
Updates details (like notes) for a specific wishlist item.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/wishlist/update`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "cust_id": 1,
  "prod_id": 5,
  "notes": "Get this if it goes on sale"
}
```

### Flow
1. Validate that `cust_id` and `prod_id` are provided.
2. Save/return the updated item data with the new notes.
3. Return success.
