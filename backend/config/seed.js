const pool = require('./db');
const bcrypt = require('bcryptjs');

function round2(n) {
  return Math.round(n * 100) / 100;
}

const demoEnquiries = [
  {
    enquiry: { number: 'ENQ-000001', customer_id: 1, requiredOffset: 14, notes: 'Urgent bearing replacement for assembly line', status: 'QUOTED' },
    items: [ { product_id: 1, quantity: 100 }, { product_id: 3, quantity: 200 } ],
    quotation: {
      number: 'QTN-000001', validOffset: 15, status: 'SENT',
      lines: [
        { product_id: 1, quantity: 100, unit_price: 350, discount_percent: 5, gst_percent: 18 },
        { product_id: 3, quantity: 200, unit_price: 180, discount_percent: 0, gst_percent: 18 },
      ],
    },
  },
  {
    enquiry: { number: 'ENQ-000002', customer_id: 2, requiredOffset: 10, notes: 'Hydraulic cylinder for new production line', status: 'WON' },
    items: [ { product_id: 2, quantity: 5 } ],
    quotation: {
      number: 'QTN-000002', validOffset: 20, status: 'ACCEPTED',
      lines: [ { product_id: 2, quantity: 5, unit_price: 12500, discount_percent: 2, gst_percent: 18 } ],
    },
    order: { number: 'ORD-000001', status: 'PENDING' },
  },
  {
    enquiry: { number: 'ENQ-000003', customer_id: 3, requiredOffset: 21, notes: 'Flange and pressure gauge set', status: 'NEW' },
    items: [ { product_id: 5, quantity: 50 }, { product_id: 8, quantity: 25 } ],
  },
  {
    enquiry: { number: 'ENQ-000004', customer_id: 4, requiredOffset: 7, notes: 'Gear oil bulk requirement (lost to competitor)', status: 'LOST' },
    items: [ { product_id: 6, quantity: 100 } ],
  },
  {
    enquiry: { number: 'ENQ-000005', customer_id: 5, requiredOffset: 30, notes: 'Pneumatic valve + coupling elements', status: 'WON' },
    items: [ { product_id: 4, quantity: 10 }, { product_id: 7, quantity: 20 } ],
    quotation: {
      number: 'QTN-000003', validOffset: 25, status: 'ACCEPTED',
      lines: [
        { product_id: 4, quantity: 10, unit_price: 4200, discount_percent: 0, gst_percent: 18 },
        { product_id: 7, quantity: 20, unit_price: 1200, discount_percent: 10, gst_percent: 18 },
      ],
    },
    order: { number: 'ORD-000002', status: 'CONFIRMED' },
  },
];

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

async function seedDemo(client) {
  console.log('Seeding demo enquiries / quotations / sales orders...');
  for (const d of demoEnquiries) {
    const e = d.enquiry;
    const insE = await client.query(
      `INSERT INTO enquiries (enquiry_number, customer_id, required_date, notes, status, created_by)
       VALUES ($1, $2, CURRENT_DATE + $3::int, $4, $5, 2)
       ON CONFLICT (enquiry_number) DO NOTHING
       RETURNING id`,
      [e.number, e.customer_id, e.requiredOffset, e.notes, e.status]
    );
    if (insE.rowCount === 0) continue;
    const enquiryId = insE.rows[0].id;

    for (const it of d.items) {
      await client.query(
        'INSERT INTO enquiry_items (enquiry_id, product_id, quantity) VALUES ($1, $2, $3)',
        [enquiryId, it.product_id, it.quantity]
      );
    }

    let grandTotal = 0;
    let quotationId = null;
    let pricedLines = [];
    if (d.quotation) {
      const q = d.quotation;
      pricedLines = q.lines.map((l) => {
        const subtotal = l.quantity * l.unit_price;
        const afterDiscount = subtotal - (subtotal * l.discount_percent) / 100;
        return { ...l, line_amount: round2(afterDiscount + (afterDiscount * l.gst_percent) / 100) };
      });
      grandTotal = round2(pricedLines.reduce((s, l) => s + l.line_amount, 0));

      const insQ = await client.query(
        `INSERT INTO quotations (quotation_number, enquiry_id, customer_id, valid_until, grand_total, status, created_by)
         VALUES ($1, $2, $3, CURRENT_DATE + $4::int, $5, $6, 2)
         ON CONFLICT (quotation_number) DO NOTHING
         RETURNING id`,
        [q.number, enquiryId, e.customer_id, q.validOffset, grandTotal, q.status]
      );
      quotationId = insQ.rows[0].id;

      for (const l of pricedLines) {
        await client.query(
          `INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, discount_percent, gst_percent, line_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [quotationId, l.product_id, l.quantity, l.unit_price, l.discount_percent, l.gst_percent, l.line_amount]
        );
      }
    }

    if (d.order && quotationId) {
      const o = d.order;
      const insO = await client.query(
        `INSERT INTO sales_orders (order_number, quotation_id, customer_id, order_date, total_amount, status, created_by)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, 2)
         ON CONFLICT (order_number) DO NOTHING
         RETURNING id`,
        [o.number, quotationId, e.customer_id, grandTotal, o.status]
      );
      if (insO.rowCount === 0) continue;
      const orderId = insO.rows[0].id;

      for (const l of pricedLines) {
        await client.query(
          'INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, line_amount) VALUES ($1, $2, $3, $4, $5)',
          [orderId, l.product_id, l.quantity, l.unit_price, l.line_amount]
        );
      }

      if (o.status === 'CONFIRMED') {
        for (const l of pricedLines) {
          await client.query(
            'UPDATE inventory SET reserved_quantity = reserved_quantity + $1 WHERE product_id = $2',
            [l.quantity, l.product_id]
          );
        }
      }
    }
  }
}

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

    await seedDemo(client);

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
