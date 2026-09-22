# TrackingAPI Manual

How to test and use all methods in `TrackingAPI.php`.

> **Note:** TrackingAPI manages the fulfillment lifecycle of an order after checkout. Use `track_type: "pickup"` for in-store claiming and `track_type: "delivery"` for courier/freight delivery.

---

## 1. Create Fulfillment Track (`createFulfillmentTrack`)

### What it does
Retrieves the full fulfillment snapshot of an order — including its `Pickup` or (`Parcel` + `Delivery`) record, payment info, and current order status.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/tracking/create`
- **Headers**: `Content-Type: application/json`

### JSON Body (Pickup Order)
```json
{
  "ord_id": 1,
  "track_type": "pickup"
}
```

### JSON Body (Delivery Order)
```json
{
  "ord_id": 2,
  "track_type": "delivery"
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `ord_id` | Integer | Yes | ID of the order to track |
| `track_type` | String | Yes | Either `"pickup"` or `"delivery"` |

### Flow
1. Validates `ord_id` and `track_type`.
2. Finds the order. If not found → `404`.
3. For `pickup`: returns the `Pickup` record with linked payment data.
4. For `delivery`: returns the `Parcel` record with linked `Delivery` and payment data.
5. Returns `200 OK` with the full fulfillment snapshot.

---

## 2. Update Fulfillment Status (`updateFulfillmentStatus`)

### What it does
Updates the status of an active fulfillment. For pickup, it can mark the order as claimed, unclaimed, or cancelled. For delivery, it updates the delivery status (transit, delivered, returned, cancelled) and syncs the order status.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/tracking/update`
- **Headers**: `Content-Type: application/json`

### JSON Body (Mark Pickup as Claimed)
```json
{
  "track_id": 1,
  "track_type": "pickup",
  "status": "CLAIMED"
}
```

### JSON Body (Update Delivery to DELIVERED)
```json
{
  "track_id": 3,
  "track_type": "delivery",
  "status": "DELIVERED"
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `track_id` | Integer | Yes | `pickup_id` for pickup; `deliver_id` for delivery |
| `track_type` | String | Yes | Either `"pickup"` or `"delivery"` |
| `status` | String | Yes | **Pickup**: `CLAIMED`, `UNCLAIMED`, `CANCELLED` / **Delivery**: `TRANSIT`, `DELIVERED`, `RETURNED`, `CANCELLED` |

### Flow
1. Validates `track_id`, `track_type`, `status`.
2. Finds the pickup or delivery record. If not found → `404`.
3. **Pickup**: Sets `pickup_completed = now()` if status is `CLAIMED`; updates order status.
4. **Delivery**: Updates `deliver_status` on the `delivery` record; maps to order status (`DELIVERED` → `CLAIMED`, `RETURNED` → `RETURNED`, `CANCELLED` → `CANCELLED`).
5. Returns `200 OK` with updated record and new order status.

---

## 3. Close Fulfillment Track (`closeFulfillmentTrack`)

### What it does
Officially closes out a fulfillment. This is the final step — it marks the order as `CLAIMED`, sets timestamps, and closes the pickup or parcel record.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/tracking/close`
- **Headers**: `Content-Type: application/json`

### JSON Body (Close Pickup)
```json
{
  "track_id": 1,
  "track_type": "pickup"
}
```

### JSON Body (Close Delivery/Parcel)
```json
{
  "track_id": 2,
  "track_type": "delivery"
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `track_id` | Integer | Yes | `pickup_id` for pickup; `parcel_id` for delivery |
| `track_type` | String | Yes | Either `"pickup"` or `"delivery"` |

### Flow
1. Validates `track_id` and `track_type`.
2. Finds the pickup or parcel record. If not found → `404`.
3. **Pickup**: Sets `pickup_completed = now()`, updates `orders.ord_status = CLAIMED` and `ord_completed`.
4. **Delivery**: Sets `parcel_completed = now()`, updates `delivery.deliver_status = DELIVERED`, updates `orders.ord_status = CLAIMED` and `ord_completed`.
5. Returns `200 OK` with all updated records.
