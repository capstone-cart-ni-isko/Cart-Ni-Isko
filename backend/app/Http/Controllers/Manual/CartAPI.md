# CartAPI Manual

How to test and use all methods in `CartAPI.php`.

---

## 1. Add Order / Add to Cart (`addOrder`)

### What it does
Creates a new order with one or more items and places it in the customer's cart / order list.

### Postman Setup
- **Method**: `POST`
- **URL**: `http://localhost:8000/api/cart/add`
- **Headers**: `Content-Type: application/json`

### JSON Body (Single Item)
```json
{
  "cust_id": 1,
  "prod_id": 1,
  "item_qty": 2
}
```

### JSON Body (Multiple Items)
```json
{
  "cust_id": 1,
  "items": [
    {
      "prod_id": 1,
      "item_qty": 2
    },
    {
      "prod_id": 2,
      "item_qty": 1
    }
  ]
}
```

### Optional Fields
- `ord_tag`: Custom order tag/code (auto-generated as `ORD-XXXXXX` if omitted)
- `ord_status`: Defaults to `"TO PROCESS"`
- `item_amount`: Custom total price for the item (calculated automatically from product price if omitted)

### Flow
1. Validates that `cust_id` is provided.
2. Checks if the customer exists in the `customer` table. If not → return `404`.
3. Validates each product in the items list:
   - Checks if product exists in `product` table. If not → return `404`.
   - Checks if product is available (not deleted or disabled). If unavailable → return `400`.
4. Generates unique `ord_tag` and creates an `orders` record.
5. Inserts corresponding items in `items` table linked to the order.
6. Increments the customer's `cust_cart` and `cust_orders` counters.
7. Returns `201 Created` with the order and items data.

---

## 2. Display Orders (`displayOrders`)

### What it does
Retrieves all orders along with their items, product details, and customer information. Can be filtered by customer, status, or specific order ID.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/cart/display` (or with query parameters: `http://localhost:8000/api/cart/display?cust_id=1`)
- **Headers**: `Content-Type: application/json`

### URL Query Params (Optional)
| Param | Type | Description |
|---|---|---|
| `cust_id` | Integer | Filter orders belonging to a specific customer |
| `ord_status` | String | Filter by order status (e.g., `TO PROCESS`, `CLAIMED`, `CANCELLED`) |
| `ord_id` | Integer | Retrieve a specific single order |

### Flow
1. Queries the `orders` table.
2. Eager loads associated `items.product` and `customer`.
3. Applies any filters (`cust_id`, `ord_status`, `ord_id`) if provided.
4. Returns `200 OK` with the list of orders and item details.

---

## 3. Search Orders (`searchOrders`)

### What it does
Searches orders by matching order tag (`ord_tag`), status (`ord_status`), review text (`ord_review`), product name (`prod_name`), or product tag (`prod_tag`).

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/cart/search?q=shirt`
- **Headers**: `Content-Type: application/json`

### URL Query Params
| Param | Type | Description |
|---|---|---|
| `q` | String | Search term/keyword to search for |
| `cust_id` | Integer | (Optional) Limit search to a specific customer's orders |

### Flow
1. Searches across order metadata and associated product details using `LIKE` query.
2. Returns `200 OK` with all matching orders.

---

## 4. Sort Orders (`sortOrders`)

### What it does
Returns orders sorted by a chosen column and direction.

### Postman Setup
- **Method**: `GET`
- **URL**: `http://localhost:8000/api/cart/sort?sort_by=date&order=desc`
- **Headers**: `Content-Type: application/json`

### URL Query Params (Optional)
| Param | Options | Default | Description |
|---|---|---|---|
| `sort_by` | `date`, `status`, `id`, `rating`, `tag` | `date` | Field to sort by |
| `order` | `asc`, `desc` | `desc` | Sorting direction |
| `cust_id` | Integer | None | (Optional) Filter by customer before sorting |

### Flow
1. Maps `sort_by` parameter to the corresponding database column:
   - `date` → `ord_created`
   - `status` → `ord_status`
   - `id` → `ord_id`
   - `rating` → `ord_rating`
   - `tag` → `ord_tag`
2. Sorts matching orders according to `order` (`asc` or `desc`).
3. Returns `200 OK` with the sorted orders list.

---

## 5. Remove Order (`removeOrder`)

### What it does
Deletes an order and its associated items from the cart / database, and updates the customer's cart count.

### Postman Setup
- **Method**: `DELETE`
- **URL**: `http://localhost:8000/api/cart/remove`
- **Headers**: `Content-Type: application/json`

### JSON Body
```json
{
  "ord_id": 1
}
```

### Flow
1. Validates that `ord_id` is provided.
2. Checks if order exists in `orders` table. If not → return `404`.
3. Deletes all associated items from `items` table.
4. Deletes the order from `orders` table.
5. Decrements `cust_cart` and `cust_orders` counters on `customer` if greater than 0.
6. Returns `200 OK` confirming removal.
