# OrdersAPI Manual

How to test and use all methods in `OrdersAPI.php`.

---

## 1. Add Product to Order (`addProductToOrder`)

### What it does
Adds a product to an existing order. If the product is already in the order, it increments the quantity and recalculates the amount instead of creating a duplicate.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/orders/add`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 1,
  "prod_id": 3,
  "item_qty": 2,
  "item_amount": 200.00
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | ID of the order to add the product to |
| `prod_id` | Integer | Yes | ID of the product to add |
| `item_qty` | Integer | No | Quantity to add (default: 1) |
| `item_amount` | Numeric | No | Custom total amount (auto-computed as `prod_price × qty` if omitted) |

### Flow
1. Validates that `ord_id` and `prod_id` are present.
2. Checks that the order exists. If not → `404`.
3. Checks that the product exists and is not disabled/deleted. If not → `404` or `400`.
4. If the product already exists in the order → increments `item_qty` and adds to `item_amount`, returns `200`.
5. Otherwise, creates a new `Item` record → returns `201`.

---

## 2. Update Order Details (`updateOrderDetails`)

### What it does
Updates any combination of fields on an existing order. Only the fields you send will be changed.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/orders/update`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 1,
  "ord_status": "TO CLAIM",
  "ord_rating": 5,
  "ord_review": "Great service!",
  "ord_tag": "BATCH-2026"
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | ID of the order to update |
| `ord_tag` | String | No | Custom label/tag for the order |
| `ord_status` | String | No | Status (e.g., `TO PROCESS`, `TO CLAIM`, `TO RECEIVE`, `DONE`) |
| `ord_rating` | Integer | No | Rating (0–5) |
| `ord_review` | String | No | Customer review text |
| `ord_completed` | Datetime | No | Completion timestamp |

### Flow
1. Validates that `ord_id` is present.
2. Finds the order. If not found → `404`.
3. Applies only the fields included in the request.
4. Returns `200` with the updated order.

---

## 3. Remove Product from Order (`removeProductFromOrder`)

### What it does
Removes a specific product (item) from an existing order. The order itself is **not deleted** even if all items are removed.

### Postman Setup
- **Method**: `DELETE`
- **URL**: `http://localhost:8000/api/orders/remove`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 1,
  "prod_id": 3
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | ID of the order |
| `prod_id` | Integer | Yes | ID of the product to remove from the order |

### Flow
1. Validates that `ord_id` and `prod_id` are present.
2. Checks that the order exists. If not → `404`.
3. Checks that the product exists in that order. If not → `404`.
4. Deletes the `Item` record → returns `200`.
