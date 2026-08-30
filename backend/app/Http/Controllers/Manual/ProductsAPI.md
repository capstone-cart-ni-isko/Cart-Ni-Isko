# ProductsAPI Reference Manual

This controller manages the product catalog and inventory data, mapping requests directly to the `product` database table.

---

## 1. Endpoints and Actions Reference

### A. Adding a Product (`addProduct`)
- **Route**: `POST /api/products/add`
- **Method**: `ProductsAPI@addProduct`
- **Inputs**: `prod_name` (req), `prod_tag` (req), `prod_price` (req), `prod_qty` (req), `prod_categ` (opt), `prod_desc` (opt).
- **Process**: Runs validator, persists to database, and initializes statistical trackers:
  - `prod_peakqty` and `prod_todayqty` are set to the initial quantity.
  - `prod_peaksold` and `prod_todaysold` are initialized to `0.00`.
  - `prod_peakdate` is set to `now()`.

### B. Displaying Associated Orders (`displayOrders`)
- **Route**: `GET /api/products/orders`
- **Method**: `ProductsAPI@displayOrders`
- **Inputs**: `prod_id` (optional).
- **Process**: Performs a database join between `orders`, `items`, and `product`. If a `prod_id` is supplied, it filters and returns orders matching that specific product. Otherwise, it returns all orders with their item metadata.

### C. Filtering the Catalog (`filterCatalog`)
- **Route**: `GET /api/products/filter`
- **Method**: `ProductsAPI@filterCatalog`
- **Inputs**: `category` (opt), `status` (opt: `active`, `disabled`, `deleted`), `stock` (opt: `in_stock`, `out_of_stock`, `low_stock`), `low_stock_threshold` (opt, default: 5).
- **Process**: Builds a query filter dynamically. By default, it filters for `active` products (where both `prod_disabled` and `prod_deleted` are `null`).

### D. Removing a Product (`removeProduct`)
- **Route**: `DELETE /api/products/remove`
- **Method**: `ProductsAPI@removeProduct`
- **Inputs**: `prod_id` (req), `hard_delete` (opt, default: false).
- **Process**: By default, performs a **soft-delete** by setting `prod_deleted = now()`. If `hard_delete` is `true`, it permanently deletes the product record from the database.

### E. Searching Products (`searchProducts`)
- **Route**: `GET /api/products/search`
- **Method**: `ProductsAPI@searchProducts`
- **Inputs**: `q` (opt query string).
- **Process**: Executes a case-insensitive query (`ilike` on PostgreSQL) on `prod_name`, `prod_tag`, and `prod_desc` columns.

### F. Sorting Products (`sortProducts`)
- **Route**: `GET /api/products/sort`
- **Method**: `ProductsAPI@sortProducts`
- **Inputs**: `sort_by` (opt: `name`, `price`, `qty`, `created`, `popularity`), `order` (opt: `asc`, `desc`).
- **Process**: Matches `sort_by` keys to database columns (e.g. `popularity` sorts by `prod_peaksold`) and fetches active products in the sorted order.

### G. Updating Details (`updateProductDetails`)
- **Route**: `PUT /api/products/update`
- **Method**: `ProductsAPI@updateProductDetails`
- **Inputs**: `prod_id` (req) + attributes to update.
- **Process**: Runs update validator (excluding current row for unique constraints). If `prod_qty` is modified to a value higher than `prod_peakqty`, the `prod_peakqty` is updated automatically.

### H. Viewing Single Product Details (`viewProductDetails`)
- **Route**: `GET /api/products/view`
- **Method**: `ProductsAPI@viewProductDetails`
- **Inputs**: `prod_id` or `prod_tag`.
- **Process**: Returns the complete product attributes for a single catalog card.

---

## 2. Product Status Controls (Sell / Unlist)

To match the SRS stimulus/response requirements:

### I. Unlisting a Product (`unlistProduct`)
- **Route**: `POST /api/products/unlist`
- **Purpose**: Temporarily remove a product from the viewable customer catalog.
- **Action**: Sets `prod_disabled = now()`.

### J. Listing / Selling a Product (`sellProduct`)
- **Route**: `POST /api/products/sell`
- **Purpose**: Restore/put a product back for sale in the customer catalog.
- **Action**: Resets both `prod_disabled = null` and `prod_deleted = null`.

---

## 3. Important Implementation Reminders
> [!NOTE]
> - All catalog updates must ensure that the corresponding fields like `prod_peakqty` adjust when quantities exceed their historic peaks.
> - PostgreSQL database table name is singular (`product`), and the primary key is `prod_id`.
