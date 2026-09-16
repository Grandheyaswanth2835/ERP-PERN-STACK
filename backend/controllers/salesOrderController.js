const pool = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT so.*, c.company_name, q.quotation_number, u.username AS created_by_name
       FROM sales_orders so
       JOIN customers c ON so.customer_id = c.id
       JOIN quotations q ON so.quotation_id = q.id
       LEFT JOIN users u ON so.created_by = u.id
       ORDER BY so.id DESC`
    );
    const orders = result.rows;
    for (const o of orders) {
      const items = await pool.query(
        `SELECT soi.*, p.product_code, p.product_name, p.unit,
                (SELECT i.reserved_quantity FROM inventory i WHERE i.product_id = soi.product_id) AS reserved,
                (SELECT i.physical_quantity FROM inventory i WHERE i.product_id = soi.product_id) AS physical,
                ((SELECT i.physical_quantity FROM inventory i WHERE i.product_id = soi.product_id)
                 - (SELECT i.reserved_quantity FROM inventory i WHERE i.product_id = soi.product_id)) AS available
         FROM sales_order_items soi JOIN products p ON soi.product_id = p.id
         WHERE soi.sales_order_id = $1`,
        [o.id]
      );
      o.items = items.rows;
    }
    res.json(orders);
  } catch (err) {
    console.error('SalesOrder getAll error:', err);
    res.status(500).json({ error: 'Failed to fetch sales orders.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT so.*, c.company_name, q.quotation_number
       FROM sales_orders so
       JOIN customers c ON so.customer_id = c.id
       JOIN quotations q ON so.quotation_id = q.id
       WHERE so.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sales Order not found.' });
    }
    const items = await pool.query(
      `SELECT soi.*, p.product_code, p.product_name, p.unit
       FROM sales_order_items soi JOIN products p ON soi.product_id = p.id
       WHERE soi.sales_order_id = $1`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], items: items.rows });
  } catch (err) {
    console.error('SalesOrder getById error:', err);
    res.status(500).json({ error: 'Failed to fetch sales order.' });
  }
};

/**
 * Confirm Sales Order = reserve inventory.
 *
 * Concurrency safety: we use a single database transaction and lock every
 * inventory row with SELECT ... FOR UPDATE. Locks are acquired in a sorted
 * order of product_id to avoid deadlocks. Once the rows are locked, no other
 * confirmation can read-modify-write the same inventory, so the two
 * near-simultaneous reservations (User A: 80, User B: 50 on 100 available)
 * are serialized and the second one fails with an insufficient stock error.
 */
exports.confirm = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM sales_orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales Order not found.' });
    }
    const order = orderResult.rows[0];

    if (order.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Only a PENDING order can be confirmed. Current status: ${order.status}.` });
    }

    const itemsResult = await client.query(
      'SELECT * FROM sales_order_items WHERE sales_order_id = $1 ORDER BY product_id',
      [id]
    );
    const items = itemsResult.rows;

    const shortage = [];

    for (const item of items) {
      const invResult = await client.query(
        'SELECT * FROM inventory WHERE product_id = $1 FOR UPDATE',
        [item.product_id]
      );
      if (invResult.rows.length === 0) {
        shortage.push({ product_id: item.product_id, message: 'No inventory record' });
        continue;
      }
      const inv = invResult.rows[0];
      const available = inv.physical_quantity - inv.reserved_quantity;
      if (available < item.quantity) {
        shortage.push({
          product_id: item.product_id,
          required: item.quantity,
          available,
          physical: inv.physical_quantity,
          reserved: inv.reserved_quantity,
        });
      }
    }

    if (shortage.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Insufficient available inventory to confirm this order.',
        shortage,
      });
    }

    for (const item of items) {
      await client.query(
        'UPDATE inventory SET reserved_quantity = reserved_quantity + $1 WHERE product_id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      "UPDATE sales_orders SET status = 'CONFIRMED' WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Sales Order confirmed and inventory reserved successfully.', order_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('SalesOrder confirm error:', err);
    res.status(500).json({ error: 'Failed to confirm sales order.' });
  } finally {
    client.release();
  }
};

/**
 * Cancel a Sales Order:
 *  - PENDING/CONFIRMED orders can be cancelled.
 *  - If CONFIRMED, all reserved inventory is released back.
 */
exports.cancel = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM sales_orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales Order not found.' });
    }
    const order = orderResult.rows[0];

    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Order in status ${order.status} cannot be cancelled.` });
    }

    if (order.status === 'CONFIRMED') {
      const itemsResult = await client.query(
        'SELECT * FROM sales_order_items WHERE sales_order_id = $1 ORDER BY product_id',
        [id]
      );
      for (const item of itemsResult.rows) {
        await client.query(
          'UPDATE inventory SET reserved_quantity = GREATEST(0, reserved_quantity - $1) WHERE product_id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    await client.query(
      "UPDATE sales_orders SET status = 'CANCELLED' WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Sales Order cancelled and inventory released.', order_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('SalesOrder cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel sales order.' });
  } finally {
    client.release();
  }
};

/**
 * Dispatch a CONFIRMED Sales Order.
 * Rules:
 *  - Only CONFIRMED orders may be dispatched.
 *  - Prevent duplicate dispatch (a dispatch record already exists for the order).
 *  - Prevent dispatch beyond reserved quantity.
 * When dispatched:
 *  physical_quantity decreases and reserved_quantity decreases by the dispatched qty.
 */
exports.dispatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { vehicle_number, driver_name, dispatch_date } = req.body;

    if (!vehicle_number || !driver_name) {
      return res.status(400).json({ error: 'vehicle_number and driver_name are required.' });
    }

    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM sales_orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales Order not found.' });
    }
    const order = orderResult.rows[0];

    if (order.status !== 'CONFIRMED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Only a CONFIRMED order can be dispatched. Current status: ${order.status}.` });
    }

    const existingDispatch = await client.query(
      'SELECT id FROM dispatches WHERE sales_order_id = $1',
      [id]
    );
    if (existingDispatch.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This sales order has already been dispatched.' });
    }

    const itemsResult = await client.query(
      'SELECT * FROM sales_order_items WHERE sales_order_id = $1 ORDER BY product_id',
      [id]
    );
    const items = itemsResult.rows;

    for (const item of items) {
      const invResult = await client.query(
        'SELECT * FROM inventory WHERE product_id = $1 FOR UPDATE',
        [item.product_id]
      );
      const inv = invResult.rows[0];
      if (!inv || inv.reserved_quantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Cannot dispatch. Reserved stock for product ${item.product_id} is less than required (${item.quantity}).`,
        });
      }
    }

    const dispatchResult = await client.query(
      `INSERT INTO dispatches (dispatch_number, sales_order_id, dispatch_date, vehicle_number, driver_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      ['DSP-PENDING', id, dispatch_date || new Date(), vehicle_number, driver_name, req.user.id]
    );
    const dispatch = dispatchResult.rows[0];
    const dspNumber = `DSP-${String(dispatch.id).padStart(6, '0')}`;
    await client.query('UPDATE dispatches SET dispatch_number = $1 WHERE id = $2', [dspNumber, dispatch.id]);

    for (const item of items) {
      await client.query(
        `INSERT INTO dispatch_items (dispatch_id, sales_order_item_id, product_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [dispatch.id, item.id, item.product_id, item.quantity]
      );
      await client.query(
        `UPDATE inventory
         SET physical_quantity = physical_quantity - $1,
             reserved_quantity = reserved_quantity - $1
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      "UPDATE sales_orders SET status = 'DISPATCHED' WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    res.json({
      message: 'Dispatch processed successfully.',
      dispatch_number: dspNumber,
      sales_order_id: id,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('SalesOrder dispatch error:', err);
    res.status(500).json({ error: 'Failed to dispatch sales order.' });
  } finally {
    client.release();
  }
};

exports.getDispatches = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, so.order_number, c.company_name
       FROM dispatches d
       JOIN sales_orders so ON d.sales_order_id = so.id
       JOIN customers c ON so.customer_id = c.id
       ORDER BY d.id DESC`
    );
    const dispatches = result.rows;
    for (const d of dispatches) {
      const items = await pool.query(
        `SELECT di.*, p.product_code, p.product_name, p.unit
         FROM dispatch_items di JOIN products p ON di.product_id = p.id
         WHERE di.dispatch_id = $1`,
        [d.id]
      );
      d.items = items.rows;
    }
    res.json(dispatches);
  } catch (err) {
    console.error('Dispatch getAll error:', err);
    res.status(500).json({ error: 'Failed to fetch dispatches.' });
  }
};