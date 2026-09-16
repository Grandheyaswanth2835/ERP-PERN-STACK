const pool = require('../config/db');

exports.create = async (req, res) => {
  try {
    const { company_name, contact_person, mobile, email, city } = req.body;
    if (!company_name || !contact_person || !mobile || !email || !city) {
      return res.status(400).json({ error: 'All customer fields are required.' });
    }
    const result = await pool.query(
      'INSERT INTO customers (company_name, contact_person, mobile, email, city, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [company_name, contact_person, mobile, email, city, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Customer create error:', err);
    res.status(500).json({ error: 'Failed to create customer.' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Customer getAll error:', err);
    res.status(500).json({ error: 'Failed to fetch customers.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Customer getById error:', err);
    res.status(500).json({ error: 'Failed to fetch customer.' });
  }
};
