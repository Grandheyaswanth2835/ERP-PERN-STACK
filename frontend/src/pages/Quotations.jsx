import React, { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

function StatusBadge({ status }) {
  const cls = status ? status.toLowerCase() : '';
  return (
    <span className={`badge badge-${cls}`}>
      <span className="badge-dot" />
      {status}
    </span>
  );
}

function fmtMoney(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    enquiry_id: '',
    valid_until: '',
    items: [],
  });

  async function load() {
    try {
      const [q, p] = await Promise.all([api('GET', '/quotations'), api('GET', '/products')]);
      setQuotations(q);
      setProducts(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function selectEnquiry(id) {
    const enquiry = enquiries.find((e) => e.id === Number(id));
    const items = enquiry
      ? enquiry.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.base_price || '',
          discount_percent: 0,
          gst_percent: 18,
        }))
      : [];
    setForm((f) => ({ ...f, enquiry_id: id, items }));
  }

  function setItem(idx, field, value) {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, items };
    });
  }

  async function handleCreateQuotation(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api('POST', '/quotations', { ...form, status: 'DRAFT' });
      setShowForm(false);
      setForm({ enquiry_id: '', valid_until: '', items: [] });
      setSuccess('Quotation created successfully.');
      await loadEnquiries();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadEnquiries() {
    const enq = await api('GET', '/enquiries');
    setEnquiries(enq);
    setShowForm(true);
  }

  async function handleStatus(q, status) {
    setError('');
    setSuccess('');
    try {
      await api('PATCH', `/quotations/${q.id}/status`, { status });
      setSuccess(`Quotation ${q.quotation_number} marked ${status}.`);
      load();
      loadEnquiries();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConvert(q) {
    setError('');
    setSuccess('');
    try {
      const res = await api('POST', `/quotations/${q.id}/convert`);
      setSuccess(`Sales Order ${res.order_number} created from quotation ${q.quotation_number}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const unfiled = enquiries.filter((e) => !quotations.some((q) => q.enquiry_id === e.id));

  function lineAmount(item) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const disc = Number(item.discount_percent) || 0;
    const gst = Number(item.gst_percent) || 0;
    const subtotal = qty * price;
    const afterDisc = subtotal - (subtotal * disc) / 100;
    return afterDisc + (afterDisc * gst) / 100;
  }

  const formTotal = form.items.reduce((sum, i) => sum + lineAmount(i), 0);

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Pricing against enquiries — totals calculated by the backend"
        actions={
          <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : loadEnquiries())}>
            {showForm ? '✕ Close' : '+ New Quotation'}
          </button>
        }
      />

      <div className="page-body">
        {success && <div className="alert alert-success"><span>✓</span> {success}</div>}
        {error && <div className="alert alert-danger"><span>⚠️</span> {error}</div>}

        {showForm && (
          <div className="card mb-4">
            <div className="card-header"><h3>Create Quotation</h3></div>
            <div className="card-body">
              <form onSubmit={handleCreateQuotation}>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Enquiry Reference</label>
                    <select
                      className="form-select"
                      value={form.enquiry_id}
                      onChange={(e) => selectEnquiry(e.target.value)}
                      required
                    >
                      <option value="">Select enquiry</option>
                      {unfiled.map((e) => (
                        <option key={e.id} value={e.id}>{e.enquiry_number} · {e.company_name}</option>
                      ))}
                    </select>
                    <div className="form-hint">Only enquiries without a quotation are shown.</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valid Until</label>
                    <input
                      className="form-input"
                      type="date"
                      value={form.valid_until}
                      onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {form.items.length > 0 ? (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th style={{ width: 80 }}>Qty</th>
                          <th style={{ width: 130 }}>Unit Price</th>
                          <th style={{ width: 100 }}>Discount %</th>
                          <th style={{ width: 90 }}>GST %</th>
                          <th style={{ textAlign: 'right' }}>Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              {products
                                .filter((p) => p.id === Number(item.product_id))
                                .map((p) => (
                                  <span key={p.id} className="font-semibold">{p.product_code} — {p.product_name}</span>
                                ))}
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
                              <input
                                className="form-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unit_price}
                                onChange={(e) => setItem(idx, 'unit_price', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="form-input"
                                type="number"
                                min="0"
                                max="100"
                                value={item.discount_percent}
                                onChange={(e) => setItem(idx, 'discount_percent', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className="form-input"
                                type="number"
                                min="0"
                                value={item.gst_percent}
                                onChange={(e) => setItem(idx, 'gst_percent', e.target.value)}
                              />
                            </td>
                            <td className="cell-amount" style={{ textAlign: 'right' }}>{fmtMoney(lineAmount(item))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">🧾</div>
                    <h3>Select an enquiry first</h3>
                    <p>Only enquiries not yet quoted will appear above.</p>
                  </div>
                )}

                <div className="form-actions">
                  <div className="text-sm text-muted">Preview total (backend is authoritative)</div>
                  <div style={{ flex: 1 }} />
                  <div className="text-lg font-semibold cell-amount" style={{ fontSize: 20 }}>
                    {fmtMoney(formTotal)}
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={form.items.length === 0}>
                    Create Quotation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h3>All Quotations</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => { load(); loadEnquiries(); }}>⟳ Refresh</button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quotation No</th>
                  <th>Enquiry</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Grand Total</th>
                  <th>Valid Until</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotations.length === 0 && !loading && (
                  <tr>
                    <td colSpan="8">
                      <div className="empty-state">
                        <div className="empty-icon">🧾</div>
                        <h3>No quotations yet</h3>
                        <p>Create a quotation against an enquiry.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {quotations.map((q) => (
                  <tr key={q.id}>
                    <td className="cell-primary font-mono">{q.quotation_number}</td>
                    <td className="font-mono">{q.enquiry_number}</td>
                    <td className="font-semibold">{q.company_name}</td>
                    <td>
                      <div className="product-chips">
                        {q.items.map((i) => (
                          <span className="product-chip" key={i.id}>
                            {i.product_name} × {i.quantity}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="cell-amount">{fmtMoney(q.grand_total)}</td>
                    <td>{q.valid_until ? new Date(q.valid_until).toLocaleDateString() : '—'}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td>
                      <div className="cell-actions">
                        {q.status === 'DRAFT' && (
                          <button className="btn btn-outline btn-sm" onClick={() => handleStatus(q, 'SENT')}>Send</button>
                        )}
                        {q.status === 'SENT' && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => handleStatus(q, 'ACCEPTED')}>Accept</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleStatus(q, 'REJECTED')}>Reject</button>
                          </>
                        )}
                        {q.status === 'ACCEPTED' && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleConvert(q)}>Convert to Order</button>
                        )}
                      </div>
                    </td>
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