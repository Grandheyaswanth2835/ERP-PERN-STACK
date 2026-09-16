const pool = require('./db');

const migrationSQL = `
-- Drop tables if they exist (for clean migration)
DROP TABLE IF EXISTS dispatch_items CASCADE;
DROP TABLE IF EXISTS dispatches CASCADE;
DROP TABLE IF EXISTS sales_order_items CASCADE;
DROP TABLE IF EXISTS sales_orders CASCADE;
DROP TABLE IF EXISTS quotation_items CASCADE;
DROP TABLE IF EXISTS quotations CASCADE;
DROP TABLE IF EXISTS enquiry_items CASCADE;
DROP TABLE IF EXISTS enquiries CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'SALES_USER')),
  full_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Customers table
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(200) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  product_code VARCHAR(50) UNIQUE NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
  base_price NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Inventory table
CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  physical_quantity INTEGER NOT NULL DEFAULT 0 CHECK (physical_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_reserved_lte_physical CHECK (reserved_quantity <= physical_quantity)
);

-- 5. Enquiries table
CREATE TABLE enquiries (
  id SERIAL PRIMARY KEY,
  enquiry_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  enquiry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  required_date DATE NOT NULL,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'QUOTED', 'WON', 'LOST')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Enquiry Items table
CREATE TABLE enquiry_items (
  id SERIAL PRIMARY KEY,
  enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

-- 7. Quotations table
CREATE TABLE quotations (
  id SERIAL PRIMARY KEY,
  quotation_number VARCHAR(50) UNIQUE NOT NULL,
  enquiry_id INTEGER NOT NULL REFERENCES enquiries(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  valid_until DATE NOT NULL,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Quotation Items table
CREATE TABLE quotation_items (
  id SERIAL PRIMARY KEY,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 18.00 CHECK (gst_percent >= 0),
  line_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (line_amount >= 0)
);

-- 9. Sales Orders table
CREATE TABLE sales_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  quotation_id INTEGER UNIQUE NOT NULL REFERENCES quotations(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'DISPATCHED', 'CANCELLED')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Sales Order Items table
CREATE TABLE sales_order_items (
  id SERIAL PRIMARY KEY,
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (line_amount >= 0)
);

-- 11. Dispatches table
CREATE TABLE dispatches (
  id SERIAL PRIMARY KEY,
  dispatch_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vehicle_number VARCHAR(50) NOT NULL,
  driver_name VARCHAR(200) NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Dispatch Items table (each dispatch can have multiple products)
CREATE TABLE dispatch_items (
  id SERIAL PRIMARY KEY,
  dispatch_id INTEGER NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  sales_order_item_id INTEGER NOT NULL REFERENCES sales_order_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

-- Indexes for performance
CREATE INDEX idx_enquiries_customer ON enquiries(customer_id);
CREATE INDEX idx_enquiries_status ON enquiries(status);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_enquiry ON quotations(enquiry_id);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_quotation ON sales_orders(quotation_id);
CREATE INDEX idx_sales_orders_status ON sales_orders(status);
CREATE INDEX idx_dispatches_sales_order ON dispatches(sales_order_id);

-- Unique constraint: one sales order per quotation
-- Already enforced by UNIQUE on quotation_id in sales_orders

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_customers_modtime BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_enquiries_modtime BEFORE UPDATE ON enquiries FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_quotations_modtime BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_sales_orders_modtime BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_inventory_modtime BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_modified_column();
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting database migration...');
    await client.query(migrationSQL);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };
