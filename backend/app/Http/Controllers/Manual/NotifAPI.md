# NotifAPI Manual

How to test and use all methods in `NotifAPI.php`.

---

## 1. Create Notification (`createNotification`)

### What it does
Sends a single notification to one specific customer or employee.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/notif/create`
- **Headers**: `Content-Type: application/json`

### JSON Body (Customer)
```json
{
  "recipient_type": "customer",
  "recipient_id": 1,
  "notif_msg": "Your order #ORD-ABCDEFGH has been updated to TO CLAIM status."
}
```

### JSON Body (Employee)
```json
{
  "recipient_type": "employee",
  "recipient_id": 2,
  "notif_msg": "You have a new order assigned to your queue."
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `recipient_type` | String | Yes | Either `"customer"` or `"employee"` |
| `recipient_id` | Integer | Yes | ID of the customer (`cust_id`) or employee (`emp_id`) |
| `notif_msg` | String | Yes | The notification message text |

### Flow
1. Validates `recipient_type`, `recipient_id`, `notif_msg`.
2. Verifies the recipient exists. If not → `404`.
3. Inserts a record into `custnotif` or `empnotif` with `_read = null` (unread).
4. Returns `201 Created` with the notification record.

---

## 2. Distribute Notifications (`distributeNotifications`)

### What it does
Bulk-sends the same notification to multiple or all customers/employees at once.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/notif/distribute`
- **Headers**: `Content-Type: application/json`

### JSON Body (Broadcast to all customers)
```json
{
  "recipient_type": "customer",
  "notif_msg": "The store will be closed on October 1 for a special event."
}
```

### JSON Body (Send to specific employees)
```json
{
  "recipient_type": "employee",
  "notif_msg": "Staff meeting tomorrow at 10AM.",
  "recipient_ids": [1, 2, 3]
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `recipient_type` | String | Yes | Either `"customer"` or `"employee"` |
| `notif_msg` | String | Yes | The message to send to all recipients |
| `recipient_ids` | Array (Integer) | No | Specific IDs to target. If omitted, sends to ALL active customers/employees |

### Flow
1. Validates `recipient_type` and `notif_msg`.
2. Queries all active (not deleted/disabled) recipients of that type (or a specific subset if `recipient_ids` is provided).
3. Bulk inserts notification records.
4. Returns `201 Created` with total `sent_count`.

---

## 3. Update Notification Status (`updateNotificationStatus`)

### What it does
Marks a notification as read by setting its `_read` timestamp to the current time.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/notif/update`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "notif_id": 5,
  "recipient_type": "customer"
}
```

### Parameter Reference
| Field | Type | Required | Description |
|---|---|---|---|
| `notif_id` | Integer | Yes | ID of the notification (`custnotif_id` or `empnotif_id`) |
| `recipient_type` | String | Yes | Either `"customer"` or `"employee"` — determines which table to query |

### Flow
1. Validates `notif_id` and `recipient_type`.
2. Finds the notification. If not found → `404`.
3. If already read → returns `400 Bad Request`.
4. Sets `custnotif_read` or `empnotif_read` to `now()`.
5. Returns `200 OK` with updated notification.
