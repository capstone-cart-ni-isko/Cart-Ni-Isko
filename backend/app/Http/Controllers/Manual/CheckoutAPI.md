# CheckoutAPI Manual

How to test and use all methods in `CheckoutAPI.php`.

---

## 1. Determine Dispatch Details (`determineDispatchDetails`)

### What it does
Calculates the subtotal, dispatch/delivery fees based on modality and chosen shipping speed, and calculates the total amount due before payment.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/checkout/dispatch`
- **Headers**: `Content-Type: application/json`

### JSON Body (Delivery Modality)
```json
{
  "ord_id": 1,
  "dispatch_type": "delivery",
  "speed": "standard",
  "deliver_address": "San Juan, Legazpi City, Albay"
}
```

### JSON Body (Pickup Modality)
```json
{
  "ord_id": 1,
  "dispatch_type": "pickup",
  "appoint_id": 1
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | Order ID to be checked out |
| `dispatch_type` | String | Yes | Either `"pickup"` or `"delivery"` |
| `speed` | String | No | Delivery speed tier: `"priority"` (₱100 / 24 hrs), `"standard"` (₱50 / 2 days), `"saver"` (₱30 / 5 days). Default: `"standard"` |
| `deliver_address` | String | No | Custom address string (falls back to customer address if omitted) |
| `appoint_id` | Integer | No | Appointment ID for store pickup |

### Flow
1. Validates that `ord_id` and `dispatch_type` are present.
2. Checks if order exists in `orders` table. If not → return `404`.
3. Computes items subtotal from order's items.
4. If `pickup`: sets dispatch fee to `₱0.00` and prepares pickup location and appointment info.
5. If `delivery`: calculates tiered delivery fee (`₱100` for Priority, `₱50` for Standard, `₱30` for Saver) and estimated delivery date.
6. Returns `200 OK` with detailed cost breakdown and total amount due.

---

## 2. Integrate Payment & Complete Checkout (`integratePayment`)

### What it does
Processes customer payment, validates that sufficient amount was given, creates a `Payment` record, creates a `Pickup` or (`Delivery` + `Parcel`) record, updates the order status, decrements inventory stock, and updates customer cart count.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/checkout/payment`
- **Headers**: `Content-Type: application/json`

### JSON Body (Delivery with Payment)
```json
{
  "ord_id": 1,
  "pay_given": 500.00,
  "pay_ref": "GCASH-987654321",
  "dispatch_type": "delivery",
  "speed": "standard",
  "deliver_address": "San Juan, Legazpi City, Albay"
}
```

### JSON Body (Pickup with Exact Payment)
```json
{
  "ord_id": 1,
  "pay_given": 350.00,
  "pay_ref": "CASH-STORE",
  "dispatch_type": "pickup",
  "appoint_id": 1
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | Order ID to checkout |
| `pay_given` | Numeric | Yes | Amount of money tendered / paid |
| `pay_ref` | String | No | Transaction reference code (auto-generated if omitted) |
| `dispatch_type` | String | Yes | `"pickup"` or `"delivery"` |
| `speed` | String | No | `"priority"`, `"standard"`, or `"saver"` |
| `deliver_address` | String | No | Delivery address |
| `appoint_id` | Integer | No | Appointment ID if claiming in store |

### Flow
1. Validates that `ord_id`, `pay_given`, and `dispatch_type` are present.
2. Finds order and calculates required total (subtotal + dispatch fee).
3. Verifies `pay_given >= total_due`. If insufficient → returns `400 Bad Request`.
4. Calculates change (`pay_change = pay_given - total_due`).
5. Creates a record in the `payment` table.
6. If `pickup`: creates `pickup` record and updates order status to `"TO CLAIM"`.
7. If `delivery`: creates `delivery` (with QR and reference) and `parcel` records, and updates order status to `"TO RECEIVE"`.
8. Deducts stock quantity (`prod_qty`) and updates sales numbers for each product in the order.
9. Decrements the customer's `cust_cart` counter.
10. Returns `201 Created` with full payment, dispatch, and order receipt summary.
