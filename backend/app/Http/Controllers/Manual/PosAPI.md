# PosAPI Manual

How to test and use all methods in `PosAPI.php`.

> **Note:** PosAPI is for in-store (Point-of-Sale) operations. Orders created here do not require a customer account (`cust_id` is `null`). Checkout is always in-store pickup — no delivery option.

---

## 1. Add Product to POS Order (`addProductToOrder`)

### What it does
Adds a product to a POS order. If no `ord_id` is provided, a new anonymous order is created automatically. If the product is already in the order, its quantity is incremented.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/pos/add`
- **Headers**: `Content-Type: application/json`

### JSON Body (New Order)
```json
{
  "prod_id": 3,
  "item_qty": 1
}
```

### JSON Body (Existing POS Order)
```json
{
  "ord_id": 10,
  "prod_id": 5,
  "item_qty": 2,
  "item_amount": 150.00
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `prod_id` | Integer | Yes | ID of the product to add |
| `item_qty` | Integer | No | Quantity (default: 1) |
| `item_amount` | Numeric | No | Custom total amount (auto-computed if omitted) |
| `ord_id` | Integer | No | If provided, adds to this existing POS order; if omitted, creates a new order |

### Flow
1. Validates that `prod_id` is present.
2. Verifies the product exists and is active.
3. If `ord_id` is given: finds the order and appends/updates the product in it.
4. If no `ord_id`: creates a new `orders` record with `cust_id = null` and a `POS-XXXXXXXX` tag.
5. Returns `201 Created` (new order/item) or `200 OK` (updated existing item).

---

## 2. Checkout POS Order (`checkoutOrder`)

### What it does
Processes payment for an in-store order. Always creates a `Pickup` record (no delivery for POS). Deducts inventory and updates product sales data.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/pos/checkout`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 10,
  "pay_given": 500.00,
  "pay_ref": "CASH",
  "appoint_id": null
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | ID of the POS order to checkout |
| `pay_given` | Numeric | Yes | Amount tendered by the customer |
| `pay_ref` | String | No | Payment reference (e.g., `"CASH"`, `"GCASH-123"`). Auto-generated if omitted |
| `appoint_id` | Integer | No | Appointment ID if linked to a store visit |

### Flow
1. Validates `ord_id` and `pay_given`.
2. Computes `total_due` from the sum of all item amounts.
3. Validates `pay_given >= total_due`. If insufficient → returns `400`.
4. Creates a `Payment` record with `pay_change = pay_given - total_due`.
5. Creates a `Pickup` record (POS = always in-store).
6. Updates order status to `"TO CLAIM"` and sets `ord_completed`.
7. Deducts `prod_qty` and updates `prod_peaksold` / `prod_todaysold` for each item.
8. Returns `201 Created` with payment, pickup, and order summary.

---

## 3. Update POS Order Details (`updateOrderDetails`)

### What it does
Updates modifiable fields on a POS order. Only the fields you send in the request will be changed.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/pos/update`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 10,
  "ord_status": "DONE",
  "ord_rating": 4,
  "ord_review": "Quick and easy!"
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | ID of the POS order to update |
| `ord_tag` | String | No | Custom label/tag for the order |
| `ord_status` | String | No | Status (e.g., `TO PROCESS`, `TO CLAIM`, `DONE`) |
| `ord_rating` | Integer | No | Rating (0–5) |
| `ord_review` | String | No | Review text |
| `ord_completed` | Datetime | No | Completion timestamp |

### Flow
1. Validates that `ord_id` is present.
2. Finds the POS order. If not found → `404`.
3. Applies only the fields included in the request.
4. Returns `200` with updated order.

---

## 4. Remove Product from POS Order (`removeProductFromOrder`)

### What it does
Removes a specific product/item from a POS order. The order record is **not** automatically deleted even if all items are removed.

### Postman Setup
- **Method**: `DELETE`
- **URL**: `http://localhost:8000/api/pos/remove`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 10,
  "prod_id": 3
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | ID of the POS order |
| `prod_id` | Integer | Yes | ID of the product to remove |

### Flow
1. Validates `ord_id` and `prod_id`.
2. Finds the POS order. If not found → `404`.
3. Finds the item in that order. If not found → `404`.
4. Deletes the `Item` record → returns `200`.
