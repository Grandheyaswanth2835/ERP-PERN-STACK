const pool = require('../config/db');

exports.create = async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, enquiry_date, required_date, notes, items, status } = req.body;

    if (!customer_id || !required_date || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customer_id, required_date and items are required.' });
    }
    for (const item of items) {
      if (!item.product_id || item.quantity === undefined || item.quantity <= 0) {
        return res.status(400).json({ error: 'Each item must have a valid product_id and quantity > 0.' });
      }
    }

    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO enquiries (enquiry_number, customer_id, enquiry_date, required_date, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      ['ENQ-PENDING', customer_id, enquiry_date || new Date(), required_date, notes || null, status || 'NEW', req.user.id]
    );

    const enquiry = insertResult.rows[0];
    const number = `ENQ-${String(enquiry.id).padStart(6, '0')}`;

    await client.query('UPDATE enquiries SET enquiry_number = $1 WHERE id = $2', [number, enquiry.id]);

    for (const item of items) {
      await client.query(
        'INSERT INTO enquiry_items (enquiry_id, product_id, quantity) VALUES ($1, $2, $3)',
        [enquiry.id, item.product_id, item.quantity]
      );
    }

    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT e.*, c.company_name, c.contact_person, c.mobile, c.email, c.city
       FROM enquiries e JOIN customers c ON e.customer_id = c.id
       WHERE e.id = $1`,
      [enquiry.id]
    );

    const itemsResult = await pool.query(
      `SELECT ei.*, p.product_code, p.product_name, p.unit
       FROM enquiry_items ei JOIN products p ON ei.product_id = p.id
       WHERE ei.enquiry_id = $1`,
      [enquiry.id]
    );

    res.status(201).json({ ...full.rows[0], items: itemsResult.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Enquiry create error:', err);
    res.status(500).json({ error: 'Failed to create enquiry.' });
  } finally {
    client.release();
  }
};

exports.getAll = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, c.company_name, c.contact_person, c.mobile, c.email, c.city,
              u.username AS created_by_name
       FROM enquiries e
       JOIN customers c ON e.customer_id = c.id
       LEFT JOIN users u ON e.created_by = u.id
       ORDER BY e.id DESC`
    );
    const enquiries = result.rows;

    for (const enq of enquiries) {
      const items = await pool.query(
        `SELECT ei.*, p.product_code, p.product_name, p.unit, p.base_price
         FROM enquiry_items ei JOIN products p ON ei.product_id = p.id
         WHERE ei.enquiry_id = $1`,
        [enq.id]
      );
      enq.items = items.rows;
    }

    res.json(enquiries);
  } catch (err) {
    console.error('Enquiry getAll error:', err);
    res.status(500).json({ error: 'Failed to fetch enquiries.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, c.company_name, c.contact_person, c.mobile, c.email, c.city
       FROM enquiries e JOIN customers c ON e.customer_id = c.id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enquiry not found.' });
    }
    const items = await pool.query(
      `SELECT ei.*, p.product_code, p.product_name, p.unit, p.base_price
       FROM enquiry_items ei JOIN products p ON ei.product_id = p.id
       WHERE ei.enquiry_id = $1`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], items: items.rows });
  } catch (err) {
    console.error('Enquiry getById error:', err);
    res.status(500).json({ error: 'Failed to fetch enquiry.' });
  }
};