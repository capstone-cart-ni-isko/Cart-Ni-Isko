# Changelog

## 2026-09-25 — API integration + testing fixes

### ⚠️ Action needed after pulling
- Run `php artisan migrate` in `backend/` (adds 3 migrations, including a new `duty_shift` table).
- **New staff logins** (the old `super@super.com` login no longer works):
  - Super Admin: `superadmin@bicol-u.edu.ph` / `admin123`
  - Staff (Student Officer): `maria.santos@bicol-u.edu.ph` / `staff123`
- Staff duty is now **dated shifts**. Customers can only book pickup times when someone has a shift covering that time (Admin → **Schedule** → **Assign Duty**).

### Added
- **Duty shifts** (`/duty/display`, `/duty/assign`, `/duty/remove`): per-date shifts with start/end times (8 AM–6 PM, 30-min steps) that drive appointment slot availability. Pickup needs 1 person on shift, walk-in visits need 2. Staff can only schedule themselves; the day locks at 7:00 AM (Philippine time) except for the super admin.
- **Checkout receipt** with order code, QR code, amounts and delivery details.
- **Staff notification inbox** in the admin bell (unread badge, priority messages highlighted).
- **Send Notification** form in User Management (broadcast to customers or employees).
- **Approve / Reject** for customer cancel and return requests (Admin → Orders).
- Error message + **Retry** button when the store server can't be reached.

### Fixed
- **Staff order screens were empty** (Dashboard, Orders, Pickup, Delivery, Analytics) — staff can now read orders.
- **Stale data everywhere** (inventory, bag, stock taking up to 30s to update): server cache never cleared on the database cache store.
- **Super admin treated as regular admin** (`SUPER_ADMIN` vs `SUPER ADMIN` spelling) — caused "Administrator access is required" and the 7 AM lock.
- **Customer stock didn't match admin**: one stock number (`prod_qty`) is now used everywhere; removed the fake sample-product fallback.
- **Bag reverting after adding items**: cart updates now sync in order and ignore outdated responses.
- **Pickup booking failed** ("A valid appointment is required") and time cards piled up / duplicated.
- Delivery tracking lookup crashed (500).
- Order totals doubled; delivered orders shown as "Store Pickup".
- Empty cart orders left behind after removing items.
- Delivery ETAs now match the server (24 hrs / 2 days / 5 days).

### Changed / removed
- Inventory: summary cards and filter dropdowns are now real; removed fake "2026 Collection"/"Pre-order" chips and the Collection filter; size rows show shared stock.
- My Account: order counts, saved items and notification badge are now real.
- Checkout: removed "Ship to a different address" (use My Address instead).
- Schedule: removed non-working Day/Week/Month toggle and empty Duty Requests drawer; timeline shows real shifts.

### Tests
- Backend: 21 tests passing (new: order fulfillment, cache invalidation, duty schedule). Frontend: lint + build clean.
