const pool = require('./db');
const bcrypt = require('bcryptjs');

const users = [
  { username: 'admin', email: 'admin@erp.com', password: 'admin123', role: 'ADMIN', full_name: 'System Admin' },
  { username: 'sales1', email: 'sales1@erp.com', password: 'sales123', role: 'SALES_USER', full_name: 'Rahul Sharma' },
  { username: 'sales2', email: 'sales2@erp.com', password: 'sales123', role: 'SALES_USER', full_name: 'Priya Patel' },
];

const customers = [
  { company_name: 'ABC Engineering Pvt. Ltd.', contact_person: 'Vikram Mehta', mobile: '9876543210', email: 'vikram@abceng.com', city: 'Mumbai' },
  { company_name: 'XYZ Manufacturing Co.', contact_person: 'Anita Desai', mobile: '9876543211', email: 'anita@xyzmfg.com', city: 'Pune' },
  { company_name: 'Global Industries Ltd.', contact_person: 'Suresh Kumar', mobile: '9876543212', email: 'suresh@globalind.com', city: 'Chennai' },
  { company_name: 'Precision Tools Inc.', contact_person: 'Neha Gupta', mobile: '9876543213', email: 'neha@precision.com', city: 'Delhi' },
  { company_name: 'Steel Works Corporation', contact_person: 'Rajesh Verma', mobile: '9876543214', email: 'rajesh@steelworks.com', city: 'Ahmedabad' },
  { company_name: 'AutoParts Solutions', contact_person: 'Kavita Singh', mobile: '9876543215', email: 'kavita@autoparts.com', city: 'Bangalore' },
];

const products = [
  { product_code: 'IND-001', product_name: 'Industrial Ball Bearing 6205', category: 'Bearings', unit: 'PCS', base_price: 350.00 },
  { product_code: 'IND-002', product_name: 'Hydraulic Cylinder HC-100', category: 'Hydraulics', unit: 'PCS', base_price: 12500.00 },
  { product_code: 'IND-003', product_name: 'V-Belt Section A-42', category: 'Power Transmission', unit: 'MTR', base_price: 180.00 },
  { product_code: 'IND-004', product_name: 'Pneumatic Valve PV-32', category: 'Pneumatics', unit: 'PCS', base_price: 4200.00 },
  { product_code: 'IND-005', product_name: 'Steel Flange DN50 PN16', category: 'Pipe Fittings', unit: 'PCS', base_price: 890.00 },
  { product_code: 'IND-006', product_name: 'Industrial Gear Oil 220', category: 'Lubricants', unit: 'LTR', base_price: 650.00 },
  { product_code: 'IND-007', product_name: 'Coupling Element 28x47', category: 'Power Transmission', unit: 'PCS', base_price: 1200.00 },
  { product_code: 'IND-008', product_name: 'Pressure Gauge 0-10Bar', category: 'Instruments', unit: 'PCS', base_price: 780.00 },
];

const inventory = [
  { product_id: 1, physical_quantity: 500, reserved_quantity: 50 },
  { product_id: 2, physical_quantity: 200, reserved_quantity: 60 },
  { product_id: 3, physical_quantity: 1000, reserved_quantity: 100 },
  { product_id: 4, physical_quantity: 150, reserved_quantity: 20 },
  { product_id: 5, physical_quantity: 300, reserved_quantity: 30 },
  { product_id: 6, physical_quantity: 800, reserved_quantity: 0 },
  { product_id: 7, physical_quantity: 400, reserved_quantity: 40 },
  { product_id: 8, physical_quantity: 250, reserved_quantity: 10 },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Seeding users...');
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        'INSERT INTO users (username, email, password_hash, role, full_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
        [u.username, u.email, hash, u.role, u.full_name]
      );
    }

    console.log('Seeding customers...');
    for (const c of customers) {
      await client.query(
        'INSERT INTO customers (company_name, contact_person, mobile, email, city, created_by) VALUES ($1, $2, $3, $4, $5, 2) ON CONFLICT DO NOTHING',
        [c.company_name, c.contact_person, c.mobile, c.email, c.city]
      );
    }

    console.log('Seeding products...');
    for (const p of products) {
      await client.query(
        'INSERT INTO products (product_code, product_name, category, unit, base_price) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (product_code) DO NOTHING',
        [p.product_code, p.product_name, p.category, p.unit, p.base_price]
      );
    }

    console.log('Seeding inventory...');
    for (const inv of inventory) {
      await client.query(
        'INSERT INTO inventory (product_id, physical_quantity, reserved_quantity) VALUES ($1, $2, $3) ON CONFLICT (product_id) DO NOTHING',
        [inv.product_id, inv.physical_quantity, inv.reserved_quantity]
      );
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully!');
    console.log('\nTest Credentials:');
    console.log('  Admin  - admin / admin123');
    console.log('  Sales  - sales1 / sales123');
    console.log('  Sales  - sales2 / sales123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seed };
