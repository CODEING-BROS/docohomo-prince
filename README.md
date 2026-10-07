# DocHomoeo

Homeopathy e-commerce store: one API, a customer website and an admin dashboard.

## Layout

| Folder | What it is | Stack |
| --- | --- | --- |
| `apps/api` | Backend REST API (products, categories, brands, orders, users, coupons, blogs, doctors, enquiries) | Express 4, Mongoose 6, MongoDB |
| `apps/website` | Customer storefront | Next.js 9.4, React 18, Redux, Bootstrap/SCSS |
| `apps/dashboard` | Admin panel, served under `/admin` | Create React App 5, MUI 5 |
| `gateway` | Dev router that puts the website and the dashboard on one port | http-proxy |
| `db` | PostgreSQL: Docker setup, schema, and the scripts that fill it | PostgreSQL 18 |

## Run locally

Needs Node.js, a MongoDB server on `127.0.0.1:27017`, and Docker Desktop (for PostgreSQL).

```bash
npm run install:all   # first time only
npm run build         # build the website and the dashboard (a few minutes)
npm start             # api + built website + built dashboard, fast to open
```

`npm run dev` runs the same thing with live reload instead of the builds; it is slow to
compile, so use it only while editing frontend code. After changing frontend code, run
`npm run build` again before `npm start`.

| Open | What |
| --- | --- |
| http://localhost:3000 | Website |
| http://localhost:3000/admin | Admin dashboard |
| http://localhost:5000 | API |

Internally the website runs on port 3002 (and, in dev mode, the dashboard on 3001); the
gateway on 3000 is the only one to open.
To move the dashboard to another path, change `DASHBOARD_PATH` in `gateway/server.js`
and `homepage` in `apps/dashboard/package.json`.

Test logins are defined at the top of `apps/api/scripts/seed-local.js`
(dashboard admin email/password, and a customer phone number that logs in with `LOCAL_OTP`).
`npm run seed` re-adds them if they are missing.

## Data

Production was copied once. Nothing reads from the production database any more.

```
production MongoDB --(npm run db:pull, one time)--> local MongoDB --(npm run db:load)--> local PostgreSQL
```

- **Local MongoDB** (`dochomoeo_local`): an exact copy of production. The current API runs on this.
- **Local PostgreSQL** (`dochomoeo`, port 5433, Docker): the same data in a relational schema
  (`db/schema.sql`), ready for the rebuild. Connection string is `DATABASE_URL` in `db/.env`.

| Command | Does |
| --- | --- |
| `npm run db:up` / `npm run db:down` | Start / stop the PostgreSQL container (data is kept in a Docker volume) |
| `npm run db:load` | Drop and rebuild every PostgreSQL table from the local MongoDB copy |
| `npm run db:pull -- --yes` | Re-copy production into local MongoDB (read-only on production; replaces local data) |

The local databases hold real customer names, phone numbers, addresses and orders. Keep them
off shared machines and out of git.

How the old collections map to tables:

| MongoDB collection | PostgreSQL table(s) |
| --- | --- |
| `brands` (really the category tree) | `categories` (one tree: main, category, subcategory) |
| `categories` (really the brands) | `brands` |
| `products` | `products`, `product_images`, `product_reviews` |
| `orders` | `orders`, `order_items` |
| `users`, `admins` | `users`, `admins` |
| `banners`, `mobilebanners` | `banners` (`placement` = desktop / mobile) |
| `blogs`, `blogscategories` | `blogs`, `blog_sections`, `blog_categories` |
| `doctors`, `doctorenquiries` | `doctors`, `doctor_enquiries` |
| `coupons`, `discounts` | `coupons`, `delivery_rules` |
| `contacts`, `wholesaleenquiries`, `enquiries` | `contact_messages`, `wholesale_enquiries`, `order_enquiries` |
| `payment_histories` | `payment_history` |

## Local mode

`apps/api/.env` sets `LOCAL_MODE=true`. In local mode the API does not call live services:

- OTP SMS (MSG91): nothing is sent, the code is `LOCAL_OTP`
- order confirmation email (Gmail): skipped
- Shiprocket shipment creation and tracking: skipped
- PhonePe payment: simulated, redirects straight back to the website

| App | File | Setting |
| --- | --- | --- |
| api | `apps/api/.env` | `MONGODB_URI`, `LOCAL_MODE`, `LOCAL_OTP`, `CLIENT_URL` |
| website | `apps/website/.env.local` | `NEXT_PUBLIC_API_URL` (read by `config.js`) |
| dashboard | `apps/dashboard/.env` | `REACT_APP_BACKEND_URL`, `PORT` |
| db | `db/.env` | `DATABASE_URL`, `MONGO_LOCAL_URI` |

The original production settings are kept as `.env.live` next to each app's `.env`. They contain
live credentials: never commit them.

## Still live even locally

- Images (products, banners, blogs, doctors) are loaded from the production Firebase Storage
  bucket, and dashboard uploads go there too.
- The website loads the production Google Tag Manager container.
