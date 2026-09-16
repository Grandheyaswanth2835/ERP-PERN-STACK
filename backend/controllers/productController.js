const pool = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, i.physical_quantity, i.reserved_quantity,
              (i.physical_quantity - i.reserved_quantity) AS available_quantity
       FROM products p
       LEFT JOIN inventory i ON p.id = i.product_id
       ORDER BY p.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Product getAll error:', err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, i.physical_quantity, i.reserved_quantity,
              (i.physical_quantity - i.reserved_quantity) AS available_quantity
       FROM products p
       LEFT JOIN inventory i ON p.id = i.product_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Product getById error:', err);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
};

exports.create = async (req, res) => {
  try {
    const { product_code, product_name, category, unit, base_price } = req.body;
    if (!product_code || !product_name || !category || !unit || base_price === undefined) {
      return res.status(400).json({ error: 'All product fields are required.' });
    }
    const result = await pool.query(
      'INSERT INTO products (product_code, product_name, category, unit, base_price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [product_code, product_name, category, unit, base_price]
    );
    const product = result.rows[0];
    await pool.query(
      'INSERT INTO inventory (product_id, physical_quantity, reserved_quantity) VALUES ($1, 0, 0)',
      [product.id]
    );
    res.status(201).json(product);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Product code already exists.' });
    }
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
};
