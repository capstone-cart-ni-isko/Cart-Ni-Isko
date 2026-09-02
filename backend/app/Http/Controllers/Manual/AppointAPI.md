# AppointAPI Manual

How to test and use all methods in `AppointAPI.php`.

---

## 1. Close Appointment (`closeAppointment`)

### What it does
Marks an appointment as closed by setting its `appoint_closed` timestamp to now.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/appoint/close`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "appoint_id": 5
}
```

### Flow
1. Validate that `appoint_id` is provided.
2. Find the appointment in the database.
3. If not found → return `404`.
4. Set `appoint_closed` to the current time.
5. Return the updated appointment.

---

## 2. Create Appointment (`createAppointment`)

### What it does
Creates a new appointment for a customer. A unique QR code is auto-generated.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/appoint/create`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "cust_id": 1,
  "appoint_date": "2026-09-10 10:00:00",
  "appoint_type": "VISIT",
  "appoint_desc": "I want to see products in person"
}
```

### Flow
1. Validate that `cust_id`, `appoint_date`, and `appoint_type` are provided.
2. Auto-generate a unique QR code string (e.g., `APPT-ABCDEF1234`).
3. Save the new appointment in the database.
4. Return the created appointment data.

### Notes
- `appoint_type` is either `VISIT` or `CLAIM`.
- `appoint_desc` is optional.

---

## 3. Display Appointments (`displayAppointments`)

### What it does
Shows a list of appointments. You can filter by customer ID and/or type.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/appoint/display?cust_id=1&type=VISIT`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Description |
|---|---|---|
| `cust_id` | No | Show only this customer's appointments |
| `type` | No | Filter by `VISIT` or `CLAIM` |

### Flow
1. Start with all appointments.
2. If `cust_id` is given → filter by that customer.
3. If `type` is given → filter by that type.
4. Sort by appointment date (earliest first).
5. Return the list.

---

## 4. Search Appointments (`searchAppointments`)

### What it does
Searches appointments by description, QR code, or type.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/appoint/search?q=VISIT&cust_id=1`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Description |
|---|---|---|
| `q` | No | Search keyword |
| `cust_id` | No | Narrow results to a specific customer |

### Flow
1. Start with all appointments.
2. If `cust_id` is given → filter by that customer.
3. If `q` is given → search in `appoint_desc`, `appoint_qr`, and `appoint_type`.
4. Return matching results.

---

## 5. Sort Appointments (`sortAppointments`)

### What it does
Returns appointments sorted by a chosen column.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/appoint/sort?sort_by=date&order=desc`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Options | Default |
|---|---|---|---|
| `sort_by` | No | `date`, `created`, `type` | `date` |
| `order` | No | `asc`, `desc` | `asc` |

### Flow
1. Pick the column to sort by.
2. Pick the direction (ascending or descending).
3. Fetch and return sorted appointments.

---

## 6. Update Appointment Details (`updateAppointmentDetails`)

### What it does
Edits an existing appointment's date, type, or description.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/appoint/update`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "appoint_id": 5,
  "appoint_date": "2026-09-12 14:00:00",
  "appoint_type": "CLAIM",
  "appoint_desc": "Reschedule for order pickup"
}
```

### Flow
1. Validate that `appoint_id` is provided.
2. Find the appointment in the database.
3. If not found → return `404`.
4. Update only the fields included in the JSON body (`appoint_date`, `appoint_type`, `appoint_desc`).
5. Return the updated appointment.
