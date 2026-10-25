# Admin Side — Slowness Diagnosis

[!NOTE]
This is a read-only analysis. No code has been changed.


---

## What "admin loading" actually involves

When an employee logs in, the following happens *simultaneously* in AdminContext:

1. fetchAdminProducts() — two parallel GETs (/products/filter?status=active + ?status=disabled), both piped through presentMany().
2. fetchOrders() — GET /cart/display (staff token = every customer's orders, no pagination).

Then, as soon as the *Dashboard* route mounts, it also fires fetchDashboardSnapshot(), which adds *5 more concurrent requests* in a single Promise.all:

| # | Call | What it does |
|---|------|-------------|
| 1 | fetchAllOrders() | /cart/display again (second full order table scan) |
| 2 | /cart/display?tag_prefix=CART- | All bag/cart rows |
| 3 | fetchAppointments({ scope:'master' }) | All appointments |
| 4 | fetchAccounts() | All customers + all employees |
| 5 | fetchAdminProducts() | Two more /products/filter GETs |
| 6 | fetchSlots(today) | Slot table |
| 7 | fetchShifts(today) | Shift table |

So on first load the admin side fires *up to 9 requests in the first ~200ms*, most of which hit heavy backend paths. Every 30 seconds this repeats (AdminOrders, AdminDashboard each have their own setInterval(refresh, 30000)), stacking on top of the realtime layer.

---

## Root Causes (in priority order)

### 🔴 1. fetchAdminProducts() fires *two serial round-trips per call* (biggest single hit)

// adminProducts.js line 212
export async function fetchAdminProducts() {
  const [active, unlisted] = await Promise.all([
    apiGet('/products/filter', { status: 'active' }),
    apiGet('/products/filter', { status: 'disabled' }),
  ])
  ...
}

Each call hits ProductsAPI::filterCatalog(), which:
1. Fetches *every* product row (no pagination, no LIMIT).
2. Calls **presentMany()** on the full set, which issues *3 more queries*: one bulk SELECT on prodvar, one on reviews, one on prodsales — all joined against every product ID returned.

**On login + Dashboard mount, fetchAdminProducts() is called twice** — once from AdminContext's useEffect, and once inside fetchDashboardSnapshot(). That's *4 filter requests → 12 sub-queries* just to paint the catalog.

[!CAUTION]
`prodsales` has **no index on `prodvar_id`** (not in any migration). The `salesForProducts()` query JOINs `prodsales → prodvar` grouped by `prod_id`. Without an index on `prodsales.prodvar_id`, every call is a **full table scan on the sales history**, which gets slower with every completed order.


---

### 🔴 2. /cart/display (orders endpoint) is called *twice on Dashboard load*, with no pagination

AdminContext fires fetchOrders() on mount. Then fetchDashboardSnapshot() fires fetchAllOrders() (which also calls fetchOrders()). Both use the same staff token, so they see the *entire orders table* — all customers, all time.

The backend's ordersQuery() eager-loads a deep relationship chain for every row:

// UserAPI.php line 853
Order::with([
    'items.bag.prodvar.product',
    'pickup.appointment',
    'delivery',
    'parcel.delivery',
    'parcel.payment',
    'customer',
])

For N orders this is *6 eager-loaded relationship chains* per order. Then ordersPayload() loops through all orders again to call primePresentations() (another bulk query set). With a growing order history, this compounds significantly.

[!WARNING]
`items` has no index on `bag_id`. `bag` has no index on `prodvar_id`. Both are traversed for every order in the list. The only existing indexes on the `items` table are `ord_id` (added in `add_order_speed_indexes`), so the `items → bag → prodvar` join path hits unindexed columns.


---

### 🟠 3. fetchDashboardSnapshot() duplicates work already done in AdminContext

The Dashboard calls fetchDashboardSnapshot() on mount AND every 30 seconds. This function fetches:
- All orders (already in AdminContext.orders)
- All products (already in AdminContext.products)
- All accounts, appointments, shifts, slots

There is no deduplication or cache-sharing between the snapshot fetch and the AdminContext fetch that just ran milliseconds earlier. The **15-second AUTH_CACHE_TTL** in api.js helps for repeat reads of the same URL, but fetchAdminProducts() issues two different URLs (?status=active and ?status=disabled), so when called again from the snapshot it fires two fresh requests if the 15s window has lapsed.

---

### 🟠 4. AdminOrders and AdminDashboard both set independent 30-second intervals

// AdminDashboard.jsx line 95
const timer = setInterval(syncData, REFRESH_MS)   // → refreshOrders() + fetchDashboardSnapshot()

// AdminOrders.jsx line 120
const timer = setInterval(refreshOrders, REFRESH_MS)  // → same refreshOrders()

When *both pages are mounted* (SPA navigation), refreshOrders() can fire *twice every 30 seconds*. On top of that, the **realtime listener in AdminContext** also calls refreshOrders() and refreshProducts() on every server-side ping, which can coincide with the interval.

---

### 🟡 5. fetchAccounts() is called on every Dashboard refresh

fetchDashboardSnapshot() always calls fetchAccounts(), which fetches the full customer + employee list. This data is mostly static between sessions and does not need to refresh every 30 seconds alongside live orders.

---

### 🟡 6. bag table has no index on prodvar_id

-- From create_store_tables.php (bag table)
$table->bigInteger('prodvar_id');   -- no index declared

Every bag → prodvar join (used in the orders eager-load chain and in every cartItemPayload call) relies on the primary key of prodvar, not a foreign key index on bag. As the bag table grows (historical placed rows are never deleted), this join becomes a scan.

---

## Summary Table

| Issue | Layer | Severity | Impact |
|-------|-------|----------|--------|
| fetchAdminProducts() called 2× on login (4 GETs + 12 sub-queries) | Frontend + Backend | 🔴 High | Every page load |
| prodsales has no index on prodvar_id (salesForProducts full scan) | Database | 🔴 High | Worsens with order volume |
| Orders fetched twice (AdminContext + snapshot), no pagination | Frontend + Backend | 🔴 High | Every load + every 30s |
| Deep eager-load chain on every order row (items.bag.prodvar.product) | Backend | 🔴 High | Scales with order count |
| Dual 30s intervals when Dashboard + Orders both mounted | Frontend | 🟠 Medium | Background request churn |
| fetchAccounts() fires on every 30s Dashboard refresh | Frontend | 🟠 Medium | Unnecessary network churn |
| bag.prodvar_id unindexed | Database | 🟡 Low–Medium | Scales with bag table size |

---

## Quick Wins (no behavior change)

These can be done with minimal risk:

1. **Add DB index on prodsales.prodvar_id** — purely additive migration, immediately speeds up salesForProducts() and all analytics charts.

2. **Add DB index on bag.prodvar_id** — same pattern, speeds up every order display (the bag → prodvar join).

3. **Deduplicate products in fetchDashboardSnapshot()** — pass in AdminContext.products instead of calling fetchAdminProducts() again inside the snapshot. Eliminates 2 redundant GET requests + 6 backend sub-queries per cycle.

4. **Deduplicate orders in fetchDashboardSnapshot()** — pass in AdminContext.orders instead of calling fetchAllOrders() again. Eliminates one full /cart/display round-trip per refresh cycle.

5. **Lift the 30s refresh interval to AdminContext** — remove the per-page setInterval(refreshOrders) from AdminOrders and AdminDashboard; let AdminContext own the single timer so the same refresh never fires twice.

6. *Fetch accounts less frequently* — move fetchAccounts() out of the 30s cycle (accounts change rarely); re-fetch it once on login and on a longer interval (e.g., 5 minutes).