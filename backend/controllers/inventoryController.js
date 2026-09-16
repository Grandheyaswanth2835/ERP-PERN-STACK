const pool = require('../config/db');

exports.getInventory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, p.product_code, p.product_name, p.unit,
              (i.physical_quantity - i.reserved_quantity) AS available_quantity
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       ORDER BY p.product_code`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Inventory getInventory error:', err);
    res.status(500).json({ error: 'Failed to fetch inventory.' });
  }
};

exports.updateInventory = async (req, res) => {
  const client = await pool.connect();
  try {
    const { physical_quantity } = req.body;
    const { id } = req.params;

    if (physical_quantity === undefined || physical_quantity < 0) {
      return res.status(400).json({ error: 'Valid physical quantity is required.' });
    }

    await client.query('BEGIN');

    const current = await client.query(
      'SELECT * FROM inventory WHERE product_id = $1 FOR UPDATE',
      [id]
    );

    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inventory record not found.' });
    }

    const inv = current.rows[0];
    if (physical_quantity < inv.reserved_quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot set physical quantity below reserved quantity (${inv.reserved_quantity}).`,
      });
    }

    const result = await client.query(
      'UPDATE inventory SET physical_quantity = $1 WHERE product_id = $2 RETURNING *',
      [physical_quantity, id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Inventory update error:', err);
    res.status(500).json({ error: 'Failed to update inventory.' });
  } finally {
    client.release();
  }
};
