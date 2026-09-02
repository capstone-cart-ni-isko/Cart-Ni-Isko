# InputValidatorAPI Reference Manual

This controller handles request data validation throughout the backend API. It encapsulates rules for required fields, formats, regex criteria, and custom error messages.

---

## 1. How Validation Works

Instead of running validation directly inside controllers, APIs instantiate `InputValidatorAPI` and call the corresponding validation method.

Example:
```php
$validator = (new InputValidatorAPI()->customerSignup($json));
if ($validator) return $validator; // Stops execution if validation fails
```

If validation fails, it returns a standard JSON error response:
```json
{
  "success": false,
  "message": "Specific error message here"
}
```

---

## 2. Helper & Runner Methods

### `fail(string $message, int $status = 400)`
Standardizes the JSON error response structure.

### `validateFields(Request $json, array $rules, array $messages = [])`
Wraps Laravel's `Validator::make` utility. Returns the first validation failure message using `fail()`, or `null` if all rules pass.

### `validateAllFormats(Request $json)`
Iterates over all format checks in the request. If any fails, it returns the error response immediately.

---

## 3. Reusable Format Validators

The validator applies rules to fields if they are present in the request payload:

| Method Name | Fields Validated | Validation Rules & Custom Messages |
| :--- | :--- | :--- |
| `email` | `email` | Standard RFC/DNS email check. |
| `backupEmail` | `backupemail` | Standard RFC/DNS email check. |
| `phone` | `phone` | Must be exactly 11 digits (`regex:/^[0-9]{11}$/`). |
| `backupPhone` | `backupphone` | Must be exactly 11 digits (`regex:/^[0-9]{11}$/`). |
| `password` | `password` | At least 8 characters, containing 1 letter, 1 number, and 1 special character. |
| `nickname` | `nickname` | At least 4 characters, alphanumeric and underscores only (`^[A-Za-z0-9_]+$`). |
| `birthday` | `birthday` | Must be a valid date in the past (`before:today`). |
| `names` | `surname`, `givname`, `midname`, `suffix` | Must be valid strings with length limits. |
| `callcodes` | `callcode`, `backupcallcode` | Valid country dial codes (e.g. `+63`, `regex:/^\+?[0-9]{1,4}$/`). |
| `generalStrings` | `pronoun`, `brgy`, `city`, `province`, `country`, `type`, `college`, `studnum` | Basic string checks. |
| `booleans` | `instore` | Boolean format check. |

---

## 4. Product Validators

Added to support `ProductsAPI`:

### `addProduct(Request $json)`
- **Required**: `prod_name`, `prod_tag`, `prod_price`, `prod_qty`.
- **Database Unique Checks**: Checks if `prod_name` and `prod_tag` already exist in the `product` table.
- **Constraints**: `prod_price` and `prod_qty` must be non-negative.

### `updateProductDetails(Request $json)`
- **Required**: `prod_id` (must exist in database).
- **Constraints**: Price/quantity must be non-negative. Unique rules for `prod_name` and `prod_tag` exclude the current product `prod_id` to allow editing other fields without unique conflicts.

---

## 5. Additional Module Validators

The following validator methods have been added to support the remaining modules:

- `flagIrregularity`: Validates `action` and `desc`.
- `logAction`: Validates `action` and `desc`.
- `changeAccountType`: Validates `user_id`, `account_type`, and `new_type`.
- `deleteAccount` / `disableAccount` / `recoverAccount` / `updateAccountDetails`: Validates `user_id` and `account_type`.
- `createAppointment`: Validates `cust_id`, `appoint_date`, and `appoint_type`.
- `closeAppointment` / `updateAppointmentDetails`: Validates `appoint_id`.
- `backupCredentials`: Validates `user_id` and `account_type`.
- `recoverCredentials`: Validates `identifier` and `account_type`.
- `updateCredentials`: Validates `user_id`, `account_type`, and `new_password`.
- `createReview`: Validates `ord_id` and `ord_rating` (1-5 range).
- `deleteReview` / `moderateReview` / `updateReview`: Validates `ord_id`.
- `updateSettings`: Validates `settings` array.
- `addWishlistItem` / `addWishlistToOrder` / `removeWishlistItem` / `updateWishlistItem`: Validates `cust_id` and `prod_id`.

