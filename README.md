# Mini ERP — Industrial Products (PERN Stack)

A small ERP application covering the workflow:
**Customer Enquiry → Quotation → Sales Order → Inventory Reservation → Dispatch**

Built with **PostgreSQL + Express.js + React.js + Node.js**.

---

## 1. Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, React Router 6, Vite |
| Backend    | Node.js, Express.js |
| Database   | PostgreSQL 16 (raw SQL + `pg` pool) |
| Auth       | JWT (jsonwebtoken) + bcryptjs password hashing |
| Validation | In-backend validation on every endpoint |
| Tests      | Node's built-in test runner (no extra framework) |

Design choices:

- **Role-Based Access Control (RBAC) is enforced on the backend.** Every protected
  route reads the JWT role claim and rejects unauthorized users with `403` — frontend
  hiding of buttons is only cosmetic.
- **Quotation totals are always computed by the backend** from quantity × unit price
  (then discount % and GST %). The React app only sends line values; the final
  `grand_total` is never trusted from the client.
- **Concurrent inventory reservations are safe at the database level.** The confirm
  endpoint runs in a single PostgreSQL transaction and locks every affected inventory
  row with `SELECT ... FOR UPDATE` (locks acquired in ascending `product_id` order to
  avoid deadlocks). Two simultaneous reservations are serialized; the second one that
  sees insufficient stock fails with `409`.
- **One quotation ⇒ at most one Sales Order.** Enforced twice: a business check in the
  convert endpoint *and* a `UNIQUE` constraint on `sales_orders.quotation_id`.

---

## 2. Project Structure

```
PERN FULL STACK/
├── backend/
│   ├── config/
│   │   ├── db.js          # pg Pool
│   │   ├── migrate.js     # DDL schema (idempotent: drops & recreates)
│   │   └── seed.js        # sample data (users, customers, products, inventory)
│   ├── controllers/       # business logic per resource
│   ├── middleware/auth.js # JWT authenticate + authorize(...roles) RBAC
│   ├── routes/            # REST route definitions
│   ├── tests/             # automated test suite (5 mandatory + 1 bonus)
│   ├── server.js          # Express app
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/         # Login, Enquiries, Quotations, SalesOrders
│   │   ├── AuthContext.jsx
│   │   ├── api.js
│   │   └── App.jsx
│   ├── vite.config.js     # proxies /api → :5000
│   └── package.json
├── docs/
│   ├── ER-Diagram.md
│   └── erp-api.postman.json
└── README.md
```

---

## 3. Database Setup

### Prerequisites
- PostgreSQL 14+ installed and running on `localhost:5432`
- Node.js 18+ (global `fetch` is used by tests)

### Create the database

```bash
psql -U postgres -h localhost
CREATE DATABASE erp_database;
\q
```

### Configure environment variables

`backend/.env` (already provided — adjust user/password to your machine):

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=erp_database
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=erp_super_secret_jwt_key_2026
JWT_EXPIRES_IN=24h
PORT=5000
```

### Run migration + seed

```bash
cd backend
npm install
npm run migrate   # creates all 12 tables, constraints, indexes, triggers
npm run seed      # inserts users, customers, products, inventory
```

> `migrate.js` and `seed.js` are idempotent — safe to re-run (seed uses
> `ON CONFLICT DO NOTHING`).

---

## 4. How to Run

### Backend

```bash
cd backend
npm install
npm run migrate && npm run seed
npm run dev          # or: npm start   → http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # → http://localhost:5173 (proxies /api to :5000)
```

Open http://localhost:5173 and log in.

### Test login credentials

| Role        | Username | Password  |
|-------------|----------|-----------|
| ADMIN       | admin    | admin123  |
| SALES_USER  | sales1   | sales123  |
| SALES_USER  | sales2   | sales123  |

---

## 5. How to Run Tests

```bash
cd backend
npm run migrate && npm run seed   # ensure a clean DB first (recommended)
npm test
```

The suite runs the Express app on an ephemeral port and performs 6 tests:

| #   | Test |
|-----|------|
| 1   | Quotation total is calculated correctly (qty×price, discount, GST) |
| 2   | DRAFT / REJECTED quotation cannot create a Sales Order |
| 3   | Same quotation cannot generate duplicate Sales Orders |
| 4   | Cannot confirm (reserve) more than the available inventory (`409`) |
| 5   | Unauthorized user (SALES_USER) cannot run ADMIN-only operations (`403`) |
| BONUS | Simultaneous inventory reservations — exactly one of two concurrent confirms succeeds |

Expected output:

```
TOTAL: 6 | PASSED: 6 | FAILED: 0
```

---

## 6. API Overview

Base URL: `http://localhost:5000/api`

All endpoints except `/auth/login` require:

```
Authorization: Bearer <token>
```

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/auth/login` | public | Login, returns JWT + user |
| GET  | `/auth/me` | any | Current user profile |
| POST | `/customers` | Sales, Admin | Create customer |
| GET  | `/customers` | any | List customers |
| POST | `/enquiries` | Sales, Admin | Create enquiry (multi-product) |
| GET  | `/enquiries` | any | List enquiries + items |
| POST | `/quotations` | Sales, Admin | Create quotation (totals computed by backend) |
| GET  | `/quotations` | any | List quotations + items |
| PATCH | `/quotations/:id/status` | Sales, Admin | `SENT` / `ACCEPTED` / `REJECTED` |
| POST | `/quotations/:id/convert` | Sales, Admin | Convert ACCEPTED quotation → Sales Order |
| GET  | `/sales-orders` | any | List orders + items + stock availability |
| POST | `/sales-orders/:id/confirm` | **Admin** | Confirm = reserve inventory (concurrency-safe) |
| POST | `/sales-orders/:id/cancel` | **Admin** | Cancel + release reservation |
| POST | `/sales-orders/:id/dispatch` | **Admin** | Dispatch confirmed order |
| GET  | `/sales-orders/dispatches/list` | any | List dispatches |
| GET  | `/products` | any | Product master |
| GET  | `/products/inventory/all` | any | Inventory incl. available = physical − reserved |
| PATCH | `/products/inventory/:productId` | **Admin** | Set physical quantity (cannot go below reserved) |

### Key business rules enforced by the backend

1. **Enquiry:** `NEW → QUOTED → WON / LOST`. Creating a quotation flips the enquiry to
   `QUOTED`; accepting/rejecting the quotation flips it to `WON`/`LOST`. A `LOST`
   enquiry cannot get a new quotation.
2. **Quotation statuses:** `DRAFT → SENT → ACCEPTED / REJECTED`. Only `DRAFT` can be
   sent; only `SENT` can be accepted/rejected. Only `ACCEPTED` can be converted.
3. **Sales Order statuses:** `PENDING → CONFIRMED → DISPATCHED → CANCELLED`.
4. **Confirm = reserve:** physical quantity unchanged, `reserved_quantity += ordered qty`.
5. **Dispatch:** physical and reserved both decrease, reserved never goes negative.
6. **Prevented cases:** negative quantities (`CHECK` constraints + validation),
   reservation beyond available stock, duplicate dispatch, dispatch of a cancelled
   order, cancel of a dispatched order.

Full interactive documentation is available as a Postman collection in
[`docs/erp-api.postman.json`](docs/erp-api.postman.json) and an ER diagram in
[`docs/ER-Diagram.md`](docs/ER-Diagram.md).

---

## 7. Workflow Demo (end-to-end script)

The full flow was verified end-to-end:

1. `sales1` logs in
2. Creates customer `Sunrise Engineering Ltd.`
3. Creates enquiry ENQ‑000009 (3 products: 100×IND-001, 40×IND-002, 200×IND-003)
4. Creates quotation QTN-000009 → backend computed **₹ 6,12,715.00**
5. Marks quote `SENT` → `ACCEPTED`
6. Converts → Sales Order **ORD-000006**
7. `admin` confirms → inventory reserved (e.g. IND-002: physical 200, reserved 60→100, available 100)
8. `admin` dispatches → DSP-000001; inventory now physical 160, reserved 60, available 100

```bash
# Reproduce instantly:
cd backend
npm start
node ../smoke/smoke-test.js   # (script included in docs/smoke-test.js)
```