# Cart ni Isko

Full-stack capstone store: a **Laravel REST API** (`backend/`) talking to a
**Supabase PostgreSQL** database, consumed by a **React (Vite)** storefront
(`frontend/`).

## Quick start

```bash
npm run dev        # starts the API on :8000 and the web app on :5173
```

Or in two terminals:

```bash
npm run dev:api    # php artisan serve  -> http://127.0.0.1:8000/api
npm run dev:web    # vite               -> http://127.0.0.1:5173
```

The storefront needs the API running - without it, sign-in, the wishlist and
product lookups report "Cannot reach the server" instead of pretending to work.

## Configuration

| Where | Variable | Purpose |
| --- | --- | --- |
| `backend/.env` | `DB_*`, `DB_SSLMODE` | Supabase Postgres connection (pooler host, SSL required) |
| `frontend/.env` | `VITE_API_BASE_URL` | Backend base URL, e.g. `http://127.0.0.1:8000/api` - change this on deploy |
| `frontend/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Direct catalog read used only when the API is down |

## Database

`backend/schema.sql` holds the full Supabase schema (tables, keys, RLS).
Row Level Security is enabled on every table; only `product` is readable by the
public `anon` role, everything else is reachable through the API only.

```bash
php artisan migrate     # no-op when the Supabase tables already exist;
                        # creates them on a fresh database (and in tests)
```

## Tests

```bash
npm test               # php artisan test - runs on in-memory SQLite,
                       # never against the Supabase database
```

## Project layout

```
backend/   Laravel API (AuthAPI, ProductsAPI, WishlistAPI, CartAPI, ...)
frontend/  React storefront (routes/, context/, services/, components/)
docx_dump.txt   Text dump of cartniisko_srs_schema_api.docx (SRS schema + API spec)
```
