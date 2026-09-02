# AccountsAPI Manual

How to test and use all methods in `AccountsAPI.php`.

---

## 1. Change Account Type (`changeAccountType`)

### What it does
Changes the role/type of a customer or employee account (e.g., STUDENT → ALUMNI, STAFF → ADMIN).

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/accounts/type`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "user_id": 1,
  "account_type": "customer",
  "new_type": "ALUMNI"
}
```

### Flow
1. Validate that `user_id`, `account_type`, and `new_type` are present.
2. Find the account in the database by its ID.
3. If not found → return `404`.
4. Update the type field (`cust_type` or `emp_type`) with the new value.
5. Return the updated account data.

---

## 2. Delete Account (`deleteAccount`)

### What it does
Deletes an account. By default it is a soft-delete (marks it as deleted). If `hard_delete` is `true`, it permanently removes the record.

### Postman Setup
- **Method**: `DELETE`
- **URL**: `http://localhost:8000/api/accounts/delete`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "user_id": 1,
  "account_type": "customer",
  "hard_delete": false
}
```

### Flow
1. Validate `user_id` and `account_type`.
2. Find the account.
3. If not found → return `404`.
4. If `hard_delete` is `true` → permanently delete the row from the database.
5. If `hard_delete` is `false` (default) → just set `cust_deleted` or `emp_deleted` to the current time.
6. Return success message.

---

## 3. Disable Account (`disableAccount`)

### What it does
Temporarily bans/disables an account. The account still exists but is marked as disabled.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/accounts/disable`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "user_id": 1,
  "account_type": "employee"
}
```

### Flow
1. Validate `user_id` and `account_type`.
2. Find the account.
3. If not found → return `404`.
4. Set `cust_disabled` or `emp_disabled` to the current time.
5. Return the updated account data.

---

## 4. Display Accounts (`displayAccounts`)

### What it does
Shows a list of all non-deleted accounts. You can filter by type.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/accounts/display?account_type=all`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Options | Default |
|---|---|---|---|
| `account_type` | No | `customer`, `employee`, `all` | `all` |

### Flow
1. Check which type of accounts to show.
2. Fetch all non-deleted customers and/or employees from the database.
3. Return both lists.

---

## 5. Recover Account (`recoverAccount`)

### What it does
Brings back a disabled or soft-deleted account. Clears both `disabled` and `deleted` timestamps.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/accounts/recover`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "user_id": 1,
  "account_type": "customer"
}
```

### Flow
1. Validate `user_id` and `account_type`.
2. Find the account.
3. If not found → return `404`.
4. Set both `disabled` and `deleted` fields back to `null`.
5. Return the recovered account data.

---

## 6. Search Accounts (`searchAccounts`)

### What it does
Searches for accounts by nickname, phone, email, surname, given name, or student number.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/accounts/search?q=Johnny&account_type=all`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Description |
|---|---|---|
| `q` | No | The search keyword |
| `account_type` | No | `customer`, `employee`, or `all` (default: `all`) |

### Flow
1. Get the search keyword `q`.
2. Search customers by `cust_nickname`, `cust_phone`, `cust_email`.
3. Search employees by `emp_surname`, `emp_givname`, `emp_email`, `emp_studnum`.
4. Only returns non-deleted accounts.
5. Return matching results.

---

## 7. Sort Accounts (`sortAccounts`)

### What it does
Returns accounts sorted by a specific column and direction.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/accounts/sort?sort_by=name&order=asc&account_type=all`
- **Headers**: `Content-Type: application/json`

### URL Params
| Param | Required | Options | Default |
|---|---|---|---|
| `sort_by` | No | `created`, `name`, `type` | `created` |
| `order` | No | `asc`, `desc` | `asc` |
| `account_type` | No | `customer`, `employee`, `all` | `all` |

### Flow
1. Pick the sort column based on `sort_by`.
2. Pick the direction (`asc` or `desc`).
3. Fetch non-deleted accounts sorted accordingly.
4. Return the sorted list.

---

## 8. Update Account Details (`updateAccountDetails`)

### What it does
Edits the profile details of a customer or employee account.

### Postman Setup
- **Method**: `PUT`
- **URL**: `http://localhost:8000/api/accounts/update`
- **Headers**: `Content-Type: application/json`

### JSON Body (Customer Example)
```json
{
  "user_id": 1,
  "account_type": "customer",
  "cust_nickname": "NewNick",
  "cust_city": "Legazpi"
}
```

### JSON Body (Employee Example)
```json
{
  "user_id": 2,
  "account_type": "employee",
  "emp_surname": "Dela Cruz",
  "emp_instore": true
}
```

### Flow
1. Validate `user_id` and `account_type`.
2. Find the account.
3. If not found → return `404`.
4. Update only the fields that were included in the JSON body.
5. Return the updated account data.

### Allowed Fields
- **Customer**: `cust_nickname`, `cust_pronoun`, `cust_birthday`, `cust_brgy`, `cust_city`, `cust_province`, `cust_country`, `cust_callcode`, `cust_phone`, `cust_email`, `cust_college`
- **Employee**: `emp_surname`, `emp_givname`, `emp_midname`, `emp_suffix`, `emp_studnum`, `emp_pronoun`, `emp_birthday`, `emp_brgy`, `emp_city`, `emp_province`, `emp_country`, `emp_callcode`, `emp_phone`, `emp_email`, `emp_instore`
