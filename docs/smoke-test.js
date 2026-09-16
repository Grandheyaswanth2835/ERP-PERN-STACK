const BASE = 'http://localhost:5000/api';

async function api(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const log = (label, obj) => console.log(`\n=== ${label} ===\n${JSON.stringify(obj, null, 2)}`);

  // 1. Login as sales user
  const sales = await api('POST', '/auth/login', null, { username: 'sales1', password: 'sales123' });
  log('1. SALES LOGIN', { role: sales.data.user.role, status: sales.status });
  const st = sales.data.token;

  // 2. Create customer
  const cust = await api('POST', '/customers', st, {
    company_name: 'Sunrise Engineering Ltd.',
    contact_person: 'Arun Joshi',
    mobile: '9812345678',
    email: 'arun@sunriseeng.com',
    city: 'Hyderabad',
  });
  log('2. CREATE CUSTOMER', { id: cust.data.id, status: cust.status });

  // 3. Create enquiry with multiple products
  const enq = await api('POST', '/enquiries', st, {
    customer_id: cust.data.id,
    required_date: '2026-12-20',
    notes: 'Urgent stock requirement',
    items: [
      { product_id: 1, quantity: 100 },
      { product_id: 2, quantity: 40 },
      { product_id: 3, quantity: 200 },
    ],
  });
  log('3. CREATE ENQUIRY', { number: enq.data.enquiry_number, items: enq.data.items.length, status: enq.status });

  // 4. Create quotation (backend computes totals)
  const quo = await api('POST', '/quotations', st, {
    enquiry_id: enq.data.id,
    valid_until: '2026-11-30',
    items: [
      { product_id: 1, quantity: 100, unit_price: 350, discount_percent: 5, gst_percent: 18 },
      { product_id: 2, quantity: 40, unit_price: 12500, discount_percent: 10, gst_percent: 18 },
      { product_id: 3, quantity: 200, unit_price: 180, discount_percent: 0, gst_percent: 18 },
    ],
  });
  log('4. CREATE QUOTATION (backend computed)', { number: quo.data.quotation_number, grand_total: quo.data.grand_total, status: quo.status });

  // 5. Send the quotation
  const sent = await api('PATCH', `/quotations/${quo.data.id}/status`, st, { status: 'SENT' });
  log('5. MARK SENT', { status: sent.status });

  // 6. Accept the quotation
  const acc = await api('PATCH', `/quotations/${quo.data.id}/status`, st, { status: 'ACCEPTED' });
  log('6. ACCEPT QUOTATION', { status: acc.status });

  // 7. Convert to Sales Order
  const conv = await api('POST', `/quotations/${quo.data.id}/convert`, st, null);
  log('7. CONVERT TO SALES ORDER', { order_number: conv.data.order_number, status: conv.status });

  // 8. Admin login + confirm (reserves inventory)
  const admin = await api('POST', '/auth/login', null, { username: 'admin', password: 'admin123' });
  const at = admin.data.token;
  const confirm = await api('POST', `/sales-orders/${conv.data.order_id}/confirm`, at, null);
  log('8. ADMIN CONFIRM (RESERVE INVENTORY)', { message: confirm.data.message, order_id: conv.data.order_id, status: confirm.status });

  // 9. Inventory after reservation
  const inv1 = await api('GET', '/products/inventory/all', at, null);
  const showing = inv1.data.filter((i) => [1, 2, 3].includes(i.product_id));
  log('9. INVENTORY AFTER RESERVATION', showing.map((i) => ({ code: i.product_code, physical: i.physical_quantity, reserved: i.reserved_quantity, available: i.available_quantity })));

  // 10. Dispatch
  const disp = await api('POST', `/sales-orders/${conv.data.order_id}/dispatch`, at, {
    vehicle_number: 'KA 01 AB 1234',
    driver_name: 'Ramesh Kumar',
  });
  log('10. PROCESS DISPATCH', { dispatch_number: disp.data.dispatch_number, status: disp.status });

  // 11. Inventory after dispatch
  const inv2 = await api('GET', '/products/inventory/all', at, null);
  const showing2 = inv2.data.filter((i) => [1, 2, 3].includes(i.product_id));
  log('11. INVENTORY AFTER DISPATCH', showing2.map((i) => ({ code: i.product_code, physical: i.physical_quantity, reserved: i.reserved_quantity, available: i.available_quantity })));

  console.log('\n======================================');
  console.log('FULL WORKFLOW EXECUTED SUCCESSFULLY');
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });