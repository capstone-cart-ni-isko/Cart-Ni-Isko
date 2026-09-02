# SettingsAPI Manual

How to test and use all methods in `SettingsAPI.php`.

---

## 1. Display Settings (`displaySettings`)

### What it does
Returns the current system/store configuration values.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/settings/display`
- **Headers**: `Content-Type: application/json`

### JSON Body
None required.

### Flow
1. Build the default settings object (store name, hours, slot limits, thresholds, etc.).
2. Return it.

### Sample Success Response
```json
{
  "success": true,
  "message": "System settings retrieved successfully",
  "data": {
    "store_name": "Tindahan ni Isko",
    "operating_hours": "08:00 - 17:00",
    "max_claiming_slots": 10,
    "visit_slot_duration": 10,
    "claim_slot_duration": 30,
    "min_in_store_staff": 2,
    "low_stock_threshold": 5,
    "maintenance_mode": false
  }
}
```

---

## 2. Update Settings (`updateSettings`)

### What it does
Updates system settings with new values. You send a key-value dictionary.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/settings/update`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "settings": {
    "operating_hours": "09:00 - 18:00",
    "max_claiming_slots": 15,
    "maintenance_mode": true
  }
}
```

### Flow
1. Validate that `settings` is provided and is an array/object.
2. Accept the new settings values.
3. Return the updated settings.

### Notes
- This is a basic placeholder. Currently, it accepts and echoes back the values you send. In the future, it will persist to a settings database table.
