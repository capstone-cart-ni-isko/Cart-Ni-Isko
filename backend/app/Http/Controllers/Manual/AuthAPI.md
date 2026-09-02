# AuthAPI Reference Manual

This manual documents the authentication endpoints for both Customers and Employees. Use this guide to quickly understand the flow, parameters, and database interactions.

---

## 1. Customer Signup (`customerSignup`)

### Purpose
Registers a new customer account in the system and stores their profile information.

### Endpoint Mapping
- **Route**: `POST /api/auth/cust_signup`
- **Controller Method**: `AuthAPI@customerSignup`

### Request Payload (JSON)
```json
{
  "phone": "09123456789",
  "password": "Password123!",
  "nickname": "Johnny",
  "pronoun": "he/him",
  "birthday": "1999-12-31",
  "brgy": "San Juan",
  "city": "Legazpi",
  "province": "Albay",
  "callcode": "+63",
  "email": "johnny@example.com",
  "type": "STUDENT"
}
```

### Process Flow
1. **Validation**: Calls `InputValidatorAPI@customerSignup`.
   - Checks that required fields (`phone`, `password`, `nickname`) are present.
   - Validates formats: `phone` must be exactly 11 digits, `password` must be $\ge 8$ chars with at least one letter, number, and special character.
2. **Duplicate Check**: Checks if the `phone` number already exists in the `customer` table. If yes, returns a `409 Conflict`.
3. **Database Insertion**: Inserts a new record into the `customer` table using Eloquent.
   - Hashes the password using Laravel's `Hash::make()`.
   - Defaults properties if not provided:
     - `cust_pronoun`: `"they/them"`
     - `cust_birthday`: `"2000-01-01"`
     - `cust_callcode`: `"+63"`
     - `cust_type`: `"Student"`
     - `cust_wishlist`, `cust_cart`, `cust_orders`, `cust_appoints` are initialized to `0`.
4. **Response**: Returns the created customer object with status `201 Created`.

### Reminders
> [!WARNING]
> The database stores the phone number as `cust_phone` and passwords under `cust_password`. The password field is hidden (`$hidden`) in JSON responses.

---

## 2. Customer Login (`customerLogin`)

### Purpose
Authenticates an existing customer.

### Endpoint Mapping
- **Route**: `POST /api/auth/cust_login`
- **Controller Method**: `AuthAPI@customerLogin`

### Request Payload (JSON)
```json
{
  "phone": "09123456789",
  "password": "Password123!"
}
```

### Process Flow
1. **Validation**: Checks presence of `phone` and `password`.
2. **Retrieve & Verify**: Fetches the customer record matching `cust_phone` and verifies the password using `Hash::check()`.
3. **Response**: 
   - Success: Returns `200 OK` with customer data.
   - Failure: Returns `401 Unauthorized` for invalid credentials.

---

## 3. Employee Signup (`employeeSignup`)

### Purpose
Registers a new employee account.

### Endpoint Mapping
- **Route**: `POST /api/auth/emp_signup`
- **Controller Method**: `AuthAPI@employeeSignup`

### Request Payload (JSON)
```json
{
  "email": "staff@cartniisko.com",
  "password": "Password123!",
  "surname": "Marfil",
  "givname": "John Marvin",
  "midname": "Gumapac",
  "suffix": "",
  "studnum": "2021-12345",
  "pronoun": "he/him",
  "birthday": "2000-05-15",
  "brgy": "Brgy 1",
  "city": "Daraga",
  "province": "Albay",
  "callcode": "+63",
  "phone": "09987654321",
  "type": "STAFF",
  "instore": false
}
```

### Process Flow
1. **Validation**: Calls `InputValidatorAPI@employeeSignup` to verify required inputs: `email`, `password`, `surname`, `givname`, and `studnum`.
2. **Duplicate Check**: Checks if the `email` already exists in the `employee` table. If yes, returns `409 Conflict`.
3. **Database Insertion**: Inserts into the `employee` table with hashed password and defaults.

---

## 4. Employee Login (`employeeLogin`)

### Purpose
Authenticates an employee.

### Endpoint Mapping
- **Route**: `POST /api/auth/emp_login`
- **Controller Method**: `AuthAPI@employeeLogin`

### Request Payload (JSON)
```json
{
  "email": "staff@cartniisko.com",
  "password": "Password123!"
}
```

### Process Flow
1. **Validation**: Verifies `email` and `password` are present.
2. **Verify**: Verifies existence of employee by `emp_email` and checks password hashes.

---

## 5. Backup Credentials (`backupCredentials`)

### Purpose
Updates secondary / backup dial code, phone number, or email address for account recovery.

### Endpoint Mapping
- **Route**: `POST /api/auth/backup_credentials`
- **Controller Method**: `AuthAPI@backupCredentials`

### Request Payload (JSON)
```json
{
  "user_id": 1,
  "account_type": "customer",
  "backupcallcode": "+63",
  "backupphone": "09991234567",
  "backupemail": "backup@example.com"
}
```

---

## 6. Recovering Credentials (`recoverCredentials`)

### Purpose
Initiates credential recovery for customers or employees using their registered contact info.

### Endpoint Mapping
- **Route**: `POST /api/auth/recover_credentials`
- **Controller Method**: `AuthAPI@recoverCredentials`

### Request Payload (JSON)
```json
{
  "identifier": "09123456789",
  "account_type": "customer"
}
```

---

## 7. Updating Credentials (`updateCredentials`)

### Purpose
Updates account credentials such as primary password, phone, or email.

### Endpoint Mapping
- **Route**: `PUT /api/auth/update_credentials`
- **Controller Method**: `AuthAPI@updateCredentials`

### Request Payload (JSON)
```json
{
  "user_id": 1,
  "account_type": "customer",
  "new_password": "NewPassword123!",
  "phone": "09129876543"
}
```
