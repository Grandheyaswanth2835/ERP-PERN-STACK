const { api } = require('./helpers');
const {
  createCustomerFully, setStatus, convert, getInventory,
  makeFreshProduct, fullOrderFlow, acceptAndConvert, login,
} = require('./lib');

/**
 * Test 1: Quotation total is calculated correctly by the backend.
 * Item: qty 100 @ 350 with 10% discount and 18% GST.
 *   base        = 100 * 350                = 35000.00
 *   after disc  = 35000 * 0.90             = 31500.00
 *   GST         = 31500 * 0.18             = 5670.00
 *   line total  = 31500 + 5670             = 37170.00
 */
async function test1({ admin, sales }) {
  const customerId = await createCustomerFully(sales.token);
  const enquiry = await require('./lib').createEnquiry(sales.token, customerId, [1], [100]);
  const quotation = await require('./lib').createQuotation(
    sales.token, enquiry.id,
    [{ product_id: 1, quantity: 100, unit_price: 350, discount_percent: 10, gst_percent: 18 }]
  );
  const expected = 37170.0;
  const actual = parseFloat(quotation.grand_total);
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`Grand total mismatch. Expected ${expected}, got ${actual}`);
  }
  const line = quotation.items.find((i) => i.product_id === 1);
  if (Math.abs(parseFloat(line.line_amount) - expected) > 0.001) {
    throw new Error(`Line amount mismatch. Expected ${expected}, got ${line.line_amount}`);
  }
}

/**
 * Test 2: DRAFT or REJECTED quotation cannot be converted to a Sales Order.
 */
async function test2({ admin, sales }) {
  const customerId = await createCustomerFully(sales.token, 'Test 2 Cust');
  const pid = 1;

  // DRAFT cannot convert
  const draftFlow = await fullOrderFlow(sales.token, customerId, pid, 10, 100, 'DRAFT');
  const resDraft = await convert(sales.token, draftFlow.quotation.id);
  if (resDraft.status === 201) throw new Error('DRAFT quotation was wrongly converted to an order.');

  // REJECTED cannot convert
  const rejFlow = await fullOrderFlow(sales.token, customerId, pid, 10, 100, 'DRAFT');
  const q2 = rejFlow.quotation;
  await setStatus(sales.token, q2.id, 'SENT');
  await setStatus(sales.token, q2.id, 'REJECTED');
  const resRejected = await convert(sales.token, q2.id);
  if (resRejected.status === 201) throw new Error('REJECTED quotation was wrongly converted to an order.');

  if (!resDraft.data.error || !resRejected.data.error) throw new Error('Expected error messages from conversions.');
}

/**
 * Test 3: Same quotation cannot generate duplicate Sales Orders.
 */
async function test3({ admin, sales }) {
  const customerId = await createCustomerFully(sales.token, 'Test 3 Cust');
  const pid = 2;
  const flow = await fullOrderFlow(sales.token, customerId, pid, 5, 1200, 'DRAFT');
  const conv1 = await acceptAndConvert(sales.token, flow.quotation.id);
  if (conv1.status !== 201) throw new Error(`First conversion failed: ${JSON.stringify(conv1.data)}`);

  const conv2 = await convert(sales.token, flow.quotation.id);
  if (conv2.status !== 400) throw new Error(`Expected 400 on duplicate conversion, got ${conv2.status}`);
  if (!/duplicate|already exists/i.test(JSON.stringify(conv2.data))) {
    throw new Error('Duplicate conversion error message not clear.');
  }
}

/**
 * Test 4: Cannot confirm an order that requires more than the available inventory.
 * Fresh product set to physical=100, reserved=0 => available=100. Order requires 150.
 */
async function test4({ admin, sales }) {
  const { pid } = await makeFreshProduct(admin.token);
  const customerId = await createCustomerFully(sales.token, 'Test 4 Cust');

  const flow = await fullOrderFlow(sales.token, customerId, pid, 150, 50, 'DRAFT');
  const conv = await acceptAndConvert(sales.token, flow.quotation.id);
  if (conv.status !== 201) throw new Error(`Setup conversion failed: ${JSON.stringify(conv.data)}`);

  const confirmRes = await api('POST', `/api/sales-orders/${conv.data.order_id}/confirm`, { token: admin.token });
  if (confirmRes.status !== 409) {
    throw new Error(`Expected 409 insufficient stock, got ${confirmRes.status}: ${JSON.stringify(confirmRes.data)}`);
  }
  if (!confirmRes.data.shortage || confirmRes.data.shortage.length === 0) {
    throw new Error('Expected shortage details in the response.');
  }
}

/**
 * Test 5: Unauthorized user (SALES_USER) cannot perform an ADMIN-only operation (confirm order / manage inventory).
 */
async function test5({ admin, sales }) {
  // Invent update (admin-only)
  const inv = await getInventory(admin.token);
  const targetId = inv[0].product_id;
  const r1 = await api('PATCH', `/api/products/inventory/${targetId}`, {
    token: sales.token,
    body: { physical_quantity: 100000 },
  });
  if (r1.status !== 403) throw new Error(`Expected 403 for sales user on inventory update, got ${r1.status}.`);

  // Product create (admin-only)
  const r2 = await api('POST', '/api/products', {
    token: sales.token,
    body: { product_code: 'X-1', product_name: 'X', category: 'X', unit: 'PCS', base_price: 1 },
  });
  if (r2.status !== 403) throw new Error(`Expected 403 for sales user on product create, got ${r2.status}.`);

  // Confirm endpoint (admin-only)
  const customerId = await createCustomerFully(sales.token, 'Test 5 Cust');
  const flow = await fullOrderFlow(sales.token, customerId, 3, 5, 180, 'DRAFT');
  const conv = await acceptAndConvert(sales.token, flow.quotation.id);
  const r3 = await api('POST', `/api/sales-orders/${conv.data.order_id}/confirm`, { token: sales.token });
  if (r3.status !== 403) throw new Error(`Expected 403 for sales user on confirm, got ${r3.status}.`);

  // No token at all
  const r4 = await api('POST', '/api/sales-orders/1/confirm', {});
  if (r4.status !== 401) throw new Error(`Expected 401 without token, got ${r4.status}.`);
}

/**
 * BONUS: Simultaneous inventory reservations.
 * Fresh product with available = 100. Two orders each require 80.
 * Both confirm requests fire concurrently; only ONE may succeed.
 * Solved at the DB level via SELECT ... FOR UPDATE row locks in a transaction.
 */
async function bonusSimultaneousReservation({ admin, sales }) {
  const { pid } = await makeFreshProduct(admin.token);
  const customerId = await createCustomerFully(sales.token, 'Bonus Cust');

  const flowA = await fullOrderFlow(sales.token, customerId, pid, 80, 100, 'DRAFT');
  const flowB = await fullOrderFlow(sales.token, customerId, pid, 80, 100, 'DRAFT');

  const convA = await acceptAndConvert(sales.token, flowA.quotation.id);
  const convB = await acceptAndConvert(sales.token, flowB.quotation.id);

  const [resA, resB] = await Promise.all([
    api('POST', `/api/sales-orders/${convA.data.order_id}/confirm`, { token: admin.token }),
    api('POST', `/api/sales-orders/${convB.data.order_id}/confirm`, { token: admin.token }),
  ]);

  const successCount = [resA, resB].filter((r) => r.status === 200).length;
  const failCount = [resA, resB].filter((r) => r.status === 409).length;

  if (successCount !== 1 || failCount !== 1) {
    throw new Error(`Expected exactly one success and one failure. Got A=${resA.status} B=${resB.status}: A=${JSON.stringify(resA.data)} B=${JSON.stringify(resB.data)}`);
  }
}

const tests = [
  { name: 'Test 1: Quotation total calculated correctly', fn: test1 },
  { name: 'Test 2: DRAFT/REJECTED quotation cannot create a Sales Order', fn: test2 },
  { name: 'Test 3: Same quotation cannot generate duplicate Sales Orders', fn: test3 },
  { name: 'Test 4: Cannot reserve more than available inventory', fn: test4 },
  { name: 'Test 5: Unauthorized user cannot perform a restricted operation', fn: test5 },
  { name: 'BONUS: Simultaneous inventory reservations (concurrency)', fn: bonusSimultaneousReservation },
];

async function runAll() {
  const admin = await login('admin', 'admin123');
  const sales = await login('sales1', 'sales123');
  const ctx = { admin, sales };

  const results = [];
  for (const t of tests) {
    try {
      await t.fn(ctx);
      results.push({ name: t.name, ok: true });
      console.log(`  [PASS] ${t.name}`);
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
      console.error(`  [FAIL] ${t.name}`);
      console.error(`         ${err.message}`);
    }
  }
  return results;
}

module.exports = { runAll, api };