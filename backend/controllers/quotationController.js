const pool = require('../config/db');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeLine(subtotal, discountPercent, gstPercent) {
  const afterDiscount = subtotal - (subtotal * discountPercent) / 100;
  const gstAmount = (afterDiscount * gstPercent) / 100;
  return round2(afterDiscount + gstAmount);
}

exports.create = async (req, res) => {
  const client = await pool.connect();
  try {
    const { enquiry_id, valid_until, status, items } = req.body;

    if (!enquiry_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'enquiry_id and items are required.' });
    }

    await client.query('BEGIN');

    const enquiryResult = await client.query(
      `SELECT * FROM enquiries WHERE id = $1 FOR UPDATE`,
      [enquiry_id]
    );
    if (enquiryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Enquiry not found.' });
    }
    const enquiry = enquiryResult.rows[0];

    if (enquiry.status === 'LOST') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot create a quotation for a LOST enquiry.' });
    }

    let grandTotal = 0;
    const computedItems = [];

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Each item must have product_id and quantity > 0.' });
      }
      const productResult = await client.query(
        'SELECT id, base_price, product_name, product_code, unit FROM products WHERE id = $1',
        [item.product_id]
      );
      const empty = await client.query(
        'SELECT quantity FROM enquiry_items WHERE enquiry_id = $1 AND product_id = $2',
        [enquiry_id, item.product_id]
      );
      if (empty.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product ${item.product_id} is not part of enquiry ${enquiry.enquiry_number}.` });
      }

      const product = productResult.rows[0];
      const unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : parseFloat(product.base_price);
      const discountPercent = item.discount_percent !== undefined ? parseFloat(item.discount_percent) : 0;
      const gstPercent = item.gst_percent !== undefined ? parseFloat(item.gst_percent) : 18;

      if (unitPrice < 0 || discountPercent < 0 || discountPercent > 100 || gstPercent < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid price/discount/GST values.' });
      }

      const subtotal = item.quantity * unitPrice;
      const lineAmount = computeLine(subtotal, discountPercent, gstPercent);
      grandTotal = round2(grandTotal + lineAmount);
      computedItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        discount_percent: discountPercent,
        gst_percent: gstPercent,
        line_amount: lineAmount,
      });
    }

    const insertResult = await client.query(
      `INSERT INTO quotations (quotation_number, enquiry_id, customer_id, valid_until, grand_total, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        'QTN-PENDING',
        enquiry_id,
        enquiry.customer_id,
        valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        grandTotal,
        status || 'DRAFT',
        req.user.id,
      ]
    );
    const quotation = insertResult.rows[0];
    const qtnNumber = `QTN-${String(quotation.id).padStart(6, '0')}`;
    await client.query('UPDATE quotations SET quotation_number = $1 WHERE id = $2', [qtnNumber, quotation.id]);

    for (const ci of computedItems) {
      await client.query(
        'INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, discount_percent, gst_percent, line_amount) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [quotation.id, ci.product_id, ci.quantity, ci.unit_price, ci.discount_percent, ci.gst_percent, ci.line_amount]
      );
    }

    if (enquiry.status === 'NEW') {
      await client.query("UPDATE enquiries SET status = 'QUOTED' WHERE id = $1", [enquiry_id]);
    }

    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT q.*, c.company_name, e.enquiry_number, e.required_date
       FROM quotations q
       JOIN customers c ON q.customer_id = c.id
       JOIN enquiries e ON q.enquiry_id = e.id
       WHERE q.id = $1`,
      [quotation.id]
    );
    const itemsResult = await pool.query(
      `SELECT qi.*, p.product_code, p.product_name, p.unit
       FROM quotation_items qi JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = $1`,
      [quotation.id]
    );

    res.status(201).json({ ...full.rows[0], items: itemsResult.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Quotation create error:', err);
    res.status(500).json({ error: 'Failed to create quotation.' });
  } finally {
    client.release();
  }
};

exports.getAll = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.*, c.company_name, e.enquiry_number, u.username AS created_by_name
       FROM quotations q
       JOIN customers c ON q.customer_id = c.id
       JOIN enquiries e ON q.enquiry_id = e.id
       LEFT JOIN users u ON q.created_by = u.id
       ORDER BY q.id DESC`
    );
    const quotations = result.rows;
    for (const q of quotations) {
      const items = await pool.query(
        `SELECT qi.*, p.product_code, p.product_name, p.unit
         FROM quotation_items qi JOIN products p ON qi.product_id = p.id
         WHERE qi.quotation_id = $1`,
        [q.id]
      );
      q.items = items.rows;
    }
    res.json(quotations);
  } catch (err) {
    console.error('Quotation getAll error:', err);
    res.status(500).json({ error: 'Failed to fetch quotations.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.*, c.company_name, e.enquiry_number
       FROM quotations q
       JOIN customers c ON q.customer_id = c.id
       JOIN enquiries e ON q.enquiry_id = e.id
       WHERE q.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quotation not found.' });
    }
    const items = await pool.query(
      `SELECT qi.*, p.product_code, p.product_name, p.unit
       FROM quotation_items qi JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = $1`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], items: items.rows });
  } catch (err) {
    console.error('Quotation getById error:', err);
    res.status(500).json({ error: 'Failed to fetch quotation.' });
  }
};

exports.updateStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['SENT', 'ACCEPTED', 'REJECTED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Status must be one of SENT, ACCEPTED, REJECTED.' });
    }

    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM quotations WHERE id = $1 FOR UPDATE', [id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Quotation not found.' });
    }
    const quotation = result.rows[0];

    if (status === 'SENT') {
      if (quotation.status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Only a DRAFT quotation can be marked SENT.' });
      }
    } else {
      if (quotation.status !== 'SENT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Only a SENT quotation can be ACCEPTED or REJECTED.' });
      }
    }

    await client.query('UPDATE quotations SET status = $1 WHERE id = $2', [status, id]);

    if (status === 'REJECTED') {
      await client.query("UPDATE enquiries SET status = 'LOST' WHERE id = $1", [quotation.enquiry_id]);
    }

    await client.query('COMMIT');

    if (status === 'ACCEPTED') {
      await pool.query("UPDATE enquiries SET status = 'WON' WHERE id = $1", [quotation.enquiry_id]);
    }

    res.json({ message: `Quotation ${status} successfully.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Quotation updateStatus error:', err);
    res.status(500).json({ error: 'Failed to update quotation status.' });
  } finally {
    client.release();
  }
};

exports.convert = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const quotationResult = await client.query(
      `SELECT * FROM quotations WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (quotationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Quotation not found.' });
    }
    const quotation = quotationResult.rows[0];

    if (quotation.status !== 'ACCEPTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Only an ACCEPTED quotation can be converted. Current status: ${quotation.status}.` });
    }

    const duplicateCheck = await client.query(
      'SELECT id FROM sales_orders WHERE quotation_id = $1',
      [id]
    );
    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'A Sales Order already exists for this quotation. Duplicate conversion is not allowed.',
        existing_order_id: duplicateCheck.rows[0].id,
      });
    }

    const itemsResult = await client.query(
      'SELECT product_id, quantity, unit_price, line_amount FROM quotation_items WHERE quotation_id = $1',
      [id]
    );
    const items = itemsResult.rows;

    const insertResult = await client.query(
      `INSERT INTO sales_orders (order_number, quotation_id, customer_id, order_date, total_amount, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      ['ORD-PENDING', id, quotation.customer_id, new Date(), quotation.grand_total, 'PENDING', req.user.id]
    );
    const order = insertResult.rows[0];
    const orderNumber = `ORD-${String(order.id).padStart(6, '0')}`;
    await client.query('UPDATE sales_orders SET order_number = $1 WHERE id = $2', [orderNumber, order.id]);

    for (const item of items) {
      await client.query(
        'INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, line_amount) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.product_id, item.quantity, item.unit_price, item.line_amount]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Sales Order created successfully.',
      order_number: orderNumber,
      order_id: order.id,
      quotation_id: id,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Quotation convert error:', err);
    res.status(500).json({ error: 'Failed to convert quotation to Sales Order.' });
  } finally {
    client.release();
  }
};