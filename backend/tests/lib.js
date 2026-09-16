const { api, login } = require('./helpers');

async function createCustomerFully(token, name) {
  const r = await api('POST', '/api/customers', {
    token,
    body: {
      company_name: name || 'Test Customer Co.',
      contact_person: 'Test Person',
      mobile: '9900000001',
      email: 'test@customer.com',
      city: 'Mumbai',
    },
  });
  if (r.status !== 201) throw new Error(`Customer create failed: ${JSON.stringify(r.data)}`);
  return r.data.id;
}

async function createEnquiry(token, customerId, productIds, quantities) {
  const items = productIds.map((pid, i) => ({ product_id: pid, quantity: quantities[i] }));
  const r = await api('POST', '/api/enquiries', {
    token,
    body: { customer_id: customerId, required_date: '2027-01-31', notes: 'Automated test enquiry', items },
  });
  if (r.status !== 201) throw new Error(`Enquiry create failed: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function createQuotation(token, enquiryId, products, status = 'DRAFT') {
  const r = await api('POST', '/api/quotations', {
    token,
    body: {
      enquiry_id: enquiryId,
      valid_until: '2027-03-31',
      status,
      items: products.map((p) => ({
        product_id: p.product_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
        discount_percent: p.discount_percent || 0,
        gst_percent: p.gst_percent || 18,
      })),
    },
  });
  if (r.status !== 201) throw new Error(`Quotation create failed: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function setStatus(token, qid, status) {
  return api('PATCH', `/api/quotations/${qid}/status`, { token, body: { status } });
}

async function convert(token, qid) {
  return api('POST', `/api/quotations/${qid}/convert`, { token });
}

async function getInventory(token) {
  const r = await api('GET', '/api/products/inventory/all', { token });
  if (r.status !== 200) throw new Error(`Inventory fetch failed: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function makeFreshProduct(adminToken) {
  const code = `TST-${Date.now().toString().slice(-8)}`;
  const r = await api('POST', '/api/products', {
    token: adminToken,
    body: { product_code: code, product_name: `Test Product ${code}`, category: 'Testing', unit: 'PCS', base_price: 100 },
  });
  if (r.status !== 201) throw new Error(`Product create failed: ${JSON.stringify(r.data)}`);
  const pid = r.data.id;
  const inv = await api('PATCH', `/api/products/inventory/${pid}`, { token: adminToken, body: { physical_quantity: 100 } });
  if (inv.status !== 200) throw new Error(`Inventory update failed: ${JSON.stringify(inv.data)}`);
  return { pid, base_price: 100 };
}

async function fullOrderFlow(salesToken, customerId, pid, quantity, unitPrice = 100, status = 'DRAFT') {
  const enquiry = await createEnquiry(salesToken, customerId, [pid], [quantity]);
  const quotation = await createQuotation(salesToken, enquiry.id, [{ product_id: pid, quantity, unit_price: unitPrice }], status);
  return { enquiry, quotation };
}

async function acceptAndConvert(salesToken, qid) {
  await setStatus(salesToken, qid, 'SENT');
  const accepted = await setStatus(salesToken, qid, 'ACCEPTED');
  if (accepted.status !== 200) throw new Error(`Accept failed: ${JSON.stringify(accepted.data)}`);
  const conv = await convert(salesToken, qid);
  return conv;
}

module.exports = {
  createCustomerFully,
  createEnquiry,
  createQuotation,
  setStatus,
  convert,
  getInventory,
  makeFreshProduct,
  fullOrderFlow,
  acceptAndConvert,
  api,
  login,
};