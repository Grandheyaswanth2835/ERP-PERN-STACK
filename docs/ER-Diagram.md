# Database Schema / ER Diagram

12 relational tables with foreign keys, unique business-number columns, CHECK
constraints and triggers. The workflow chain is fully traceable:

```
users ──created_by──┐
                    ▼
customers ◄────────────────────────────────────────────┐
   │                                                    │
   └──► enquiries ──► quotations ──► sales_orders ──► dispatches
             │              │               │               │
          enquiry_items  quotation_items  sales_order_items  dispatch_items
             │              │               │               │
             └────► products ◄──────────────┴───────────────┘
                         │
                      inventory
```

## Mermaid ER diagram

```mermaid
erDiagram
    USERS ||--o{ CUSTOMERS : "created_by"
    USERS ||--o{ ENQUIRIES : "created_by"
    USERS ||--o{ QUOTATIONS : "created_by"
    USERS ||--o{ SALES_ORDERS : "created_by"
    USERS ||--o{ DISPATCHES : "created_by"

    CUSTOMERS ||--o{ ENQUIRIES : "enquiry customer"
    CUSTOMERS ||--o{ QUOTATIONS : "quotation customer"
    CUSTOMERS ||--o{ SALES_ORDERS : "order customer"

    ENQUIRIES ||--o{ ENQUIRY_ITEMS : has
    QUOTATIONS ||--o{ QUOTATION_ITEMS : has
    SALES_ORDERS ||--o{ SALES_ORDER_ITEMS : has
    DISPATCHES ||--o{ DISPATCH_ITEMS : has

    ENQUIRIES { int id PK }
    ENQUIRIES { varchar enquiry_number UK }
    ENQUIRIES { varchar status }
    ENQUIRIES { int customer_id FK }

    QUOTATIONS { int id PK }
    QUOTATIONS { varchar quotation_number UK }
    QUOTATIONS { int enquiry_id FK }
    QUOTATIONS { int customer_id FK }
    QUOTATIONS { numeric grand_total }

    SALES_ORDERS { int id PK }
    SALES_ORDERS { varchar order_number UK }
    SALES_ORDERS { int quotation_id FK UK }
    SALES_ORDERS { int customer_id FK }
    SALES_ORDERS { varchar status }

    PRODUCTS ||--o{ ENQUIRY_ITEMS : "product"
    PRODUCTS ||--o{ QUOTATION_ITEMS : "product"
    PRODUCTS ||--o{ SALES_ORDER_ITEMS : "product"
    PRODUCTS ||--o{ DISPATCH_ITEMS : "product"
    PRODUCTS ||--o| INVENTORY : "one-to-one"

    ENQUIRY_ITEMS { int product_id FK }
    QUOTATION_ITEMS { int product_id FK }
    SALES_ORDER_ITEMS { int product_id FK }
    DISPATCH_ITEMS { int product_id FK }

    INVENTORY { int product_id FK UK }
    INVENTORY { int physical_quantity }
    INVENTORY { int reserved_quantity }
```

## Table listing

| Table | Purpose | Notable constraints |
|-------|---------|---------------------|
| `users` | auth accounts | `username` & `email` UNIQUE, `role IN ('ADMIN','SALES_USER')` |
| `customers` | business customers | all profile fields NOT NULL |
| `products` | product master | `product_code` UNIQUE, `base_price >= 0` |
| `inventory` | stock | `product_id` UNIQUE/FK, `physical >= 0`, `reserved >= 0`, **`reserved <= physical`** |
| `enquiries` | enquiry header | `enquiry_number` UNIQUE, `status IN (NEW,QUOTED,WON,LOST)` |
| `enquiry_items` | enquiry lines | `quantity > 0`, FK `enquiry_id` ON DELETE CASCADE |
| `quotations` | quote header | `quotation_number` UNIQUE, `grand_total >= 0`, `status IN (DRAFT,SENT,ACCEPTED,REJECTED)` |
| `quotation_items` | quote lines | `quantity > 0`, discount 0–100, GST ≥ 0, `line_amount >= 0` |
| `sales_orders` | order header | `order_number` UNIQUE, **`quotation_id` UNIQUE (one order per quote)**, `status IN (PENDING,CONFIRMED,DISPATCHED,CANCELLED)` |
| `sales_order_items` | order lines | `quantity > 0` |
| `dispatches` | dispatch header | `dispatch_number` UNIQUE, FK `sales_order_id` |
| `dispatch_items` | dispatch lines | `quantity > 0` |

## Concurrency design

`POST /sales-orders/:id/confirm` runs inside one transaction:

1. Lock the sales order row: `SELECT * FROM sales_orders WHERE id=$1 FOR UPDATE`
2. Lock every affected inventory row: `SELECT * FROM inventory WHERE product_id=$1
   FOR UPDATE` — iterated in ascending `product_id` order to avoid deadlocks.
3. If `physical − reserved < required` for any line → `ROLLBACK`, return `409`.
4. Otherwise `UPDATE ... SET reserved_quantity = reserved_quantity + $1`.

Because PostgreSQL row locks serialize the read-modify-write, two simultaneous
requests (A: reserve 80, B: reserve 50 against 100 available) cannot both succeed —
the second transaction waits, then re-reads the committed value and fails the check.

## Triggers

`update_modified_column()` keeps `updated_at` fresh on users, customers, products,
enquiries, quotations, sales_orders and inventory.