# AccessAPI Manual

This manual explains how to test and call all methods in `AccessAPI.php`.

---

## 1. Flag Irregularity (`flagIrregularity`)

### What it does
Flags and saves suspicious or bad behavior in the system log.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/access/flag`
- **Headers**:
  - `Content-Type: application/json`

### JSON Request Body
```json
{
  "user_id": 1,
  "user_type": "customer",
  "action": "Multiple Failed Logins",
  "desc": "User entered wrong password 5 times in a row."
}
```

### Simple Flow
1. Check that `action` and `desc` are provided in the JSON body.
2. Check if the user is a `customer` or an `employee`.
3. Save the irregularity message in the log database table (`custlog` or `emplog`).
4. Return a success message with the saved log data.

### Sample Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Irregularity flagged and logged successfully",
  "data": {
    "custlog_id": 1,
    "cust_id": 1,
    "custlog_action": "[IRREGULARITY] Multiple Failed Logins",
    "custlog_desc": "User entered wrong password 5 times in a row."
  }
}
```

---

## 2. Log Action (`logAction`)

### What it does
Saves normal user or employee actions into the database log history.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/access/log`
- **Headers**:
  - `Content-Type: application/json`

### JSON Request Body
```json
{
  "user_id": 2,
  "user_type": "employee",
  "action": "Product Stock Updated",
  "desc": "Added 10 new items to product stock."
}
```

### Simple Flow
1. Check that `action` and `desc` are provided in the JSON body.
2. Check whether `user_type` is `employee` or `customer`.
3. Store the action details into the appropriate log table (`emplog` or `custlog`).
4. Return a success response.

### Sample Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Action logged successfully",
  "data": {
    "emplog_id": 1,
    "emp_id": 2,
    "emplog_action": "Product Stock Updated",
    "emplog_desc": "Added 10 new items to product stock."
  }
}
```
