import React, { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

const EMPTY_FORM = {
  customer_id: '',
  required_date: '',
  notes: '',
  items: [{ product_id: '', quantity: 1 }],
};

function StatusBadge({ status }) {
  const cls = status ? status.toLowerCase() : '';
  return (
    <span className={`badge badge-${cls}`}>
      <span className="badge-dot" />
      {status}
    </span>
  );
}

export default function Enquiries() {
  const [enquiries, setEnquiries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [newCustomer, setNewCustomer] = useState({
    company_name: '',
    contact_person: '',
    mobile: '',
    email: '',
    city: '',
  });

  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    try {
      const [enq, cust, prod] = await Promise.all([
        api('GET', '/enquiries'),
        api('GET', '/customers'),
        api('GET', '/products'),
      ]);
      setEnquiries(enq);
      setCustomers(cust);
      setProducts(prod);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setItem(idx, field, value) {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, items };
    });
  }

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { product_id: '', quantity: 1 }] }));
  }

  function removeItem(idx) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  async function handleCreateEnquiry(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api('POST', '/enquiries', form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccess('Enquiry created successfully.');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateCustomer(e) {
    e.preventDefault();
    setError('');
    try {
      const created = await api('POST', '/customers', newCustomer);
      setCustomers([...customers, created]);
      setForm((f) => ({ ...f, customer_id: created.id }));
      setShowNewCustomer(false);
      setNewCustomer({
        company_name: '',
        contact_person: '',
        mobile: '',
        email: '',
        city: '',
      });
      setSuccess(`Customer '${created.company_name}' created.`);
    } catch (err) {
      setError(err.message);
    }
  }

  const stats = {
    new: enquiries.filter((e) => e.status === 'NEW').length,
    quoted: enquiries.filter((e) => e.status === 'QUOTED').length,
    won: enquiries.filter((e) => e.status === 'WON').length,
    total: enquiries.length,
  };

  return (
    <div>
      <PageHeader
        title="Customer Enquiries"
        subtitle="Track every request from your customers"
        actions={
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setShowNewCustomer(false); }}>
            {showForm ? '✕ Close' : '+ New Enquiry'}
          </button>
        }
      />

      <div className="page-body">
        {success && <div className="alert alert-success"><span>✓</span> {success}</div>}
        {error && <div className="alert alert-danger"><span>⚠️</span> {error}</div>}

        {!showForm && (
          <div className="stats-row">
            <div className="stat-card stat-primary">
              <div className="stat-label">Total Enquiries</div>
              <div className="stat-value">{stats.total}</div>
              <div className="stat-sub">All time</div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-label">New</div>
              <div className="stat-value">{stats.new}</div>
              <div className="stat-sub">Awaiting quotation</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-label">Quoted</div>
              <div className="stat-value">{stats.quoted}</div>
              <div className="stat-sub">Quotation sent</div>
            </div>
            <div className="stat-card stat-danger">
              <div className="stat-label">Won</div>
              <div className="stat-value">{stats.won}</div>
              <div className="stat-sub">Converted to order</div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="card mb-4">
            <div className="card-header">
              <h3>Create New Enquiry</h3>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowNewCustomer(!showNewCustomer)}>
                {showNewCustomer ? '✕ Close Customer' : '+ New Customer'}
              </button>
            </div>

            {showNewCustomer && (
              <div className="card-body" style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                <h4 className="mb-2" style={{ fontSize: 14, fontWeight: 600 }}>Customer Details</h4>
                <div className="form-grid">
                  {[
                    ['company_name', 'Company Name'],
                    ['contact_person', 'Contact Person'],
                    ['mobile', 'Mobile'],
                    ['email', 'Email'],
                    ['city', 'City'],
                  ].map(([key, label]) => (
                    <div className="form-group" key={key}>
                      <label className="form-label">{label}</label>
                      <input
                        className="form-input"
                        value={newCustomer[key]}
                        onChange={(e) => setNewCustomer({ ...newCustomer, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="form-actions">
                  <button className="btn btn-success" onClick={handleCreateCustomer}>Save Customer</button>
                </div>
              </div>
            )}

            <div className="card-body">
              <form onSubmit={handleCreateEnquiry}>
                <h4 className="mb-3" style={{ fontSize: 14, fontWeight: 600 }}>Enquiry Details</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Customer</label>
                    <select
                      className="form-select"
                      value={form.customer_id}
                      onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                      required
                    >
                      <option value="">Select customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.company_name} · {c.city}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Required Date</label>
                    <input
                      className="form-input"
                      type="date"
                      value={form.required_date}
                      onChange={(e) => setForm({ ...form, required_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input
                      className="form-input"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Optional notes…"
                    />
                  </div>
                </div>

                <h4 className="mb-2 mt-4" style={{ fontSize: 14, fontWeight: 600 }}>Products</h4>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ width: 160 }}>Quantity</th>
                        <th style={{ width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <select
                              className="form-select"
                              value={item.product_id}
                              onChange={(e) => setItem(idx, 'product_id', e.target.value)}
                              required
                            >
                              <option value="">Select product</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.product_code} — {p.product_name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="form-input"
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => setItem(idx, 'quantity', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => removeItem(idx)}
                              disabled={form.items.length === 1}
                              title="Remove product"
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="form-actions">
                  <button className="btn btn-outline" type="button" onClick={addItem}>+ Add Product</button>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-primary" type="submit">Create Enquiry</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h3>All Enquiries</h3>
            <button className="btn btn-ghost btn-sm" onClick={load}>⟳ Refresh</button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Enquiry No</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Required By</th>
                  <th>Items</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.length === 0 && !loading && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <h3>No enquiries yet</h3>
                        <p>Create your first enquiry to get started.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {enquiries.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-primary font-mono">{e.enquiry_number}</td>
                    <td>
                      <div className="font-semibold">{e.company_name}</div>
                      <div className="text-sm text-muted">{e.city}</div>
                    </td>
                    <td>{new Date(e.enquiry_date).toLocaleDateString()}</td>
                    <td>{new Date(e.required_date).toLocaleDateString()}</td>
                    <td>
                      <div className="product-chips">
                        {e.items.map((i) => (
                          <span className="product-chip" key={i.id}>
                            {i.product_name} × {i.quantity}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}