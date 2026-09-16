import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
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

export default function SalesOrders() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [showInventory, setShowInventory] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [dispatchForm, setDispatchForm] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [shortageDialog, setShortageDialog] = useState(null);

  async function load() {
    try {
      const [ord, inv] = await Promise.all([
        api('GET', '/sales-orders'),
        api('GET', '/products/inventory/all'),
      ]);
      setOrders(ord);
      setInventory(inv);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDispatches() {
    try {
      const d = await api('GET', '/sales-orders/dispatches/list');
      setDispatches(d);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); loadDispatches(); }, []);

  async function handleConfirm(order) {
    setError('');
    setSuccess('');
    setConfirmingId(order.id);
    try {
      await api('POST', `/sales-orders/${order.id}/confirm`);
      setSuccess(`Order ${order.order_number} confirmed & inventory reserved.`);
      load();
    } catch (err) {
      setError(err.message === 'Insufficient available inventory to confirm this order.'
        ? 'Insufficient available inventory to confirm this order.'
        : err.message);
      if (err.data && err.data.shortage) {
        setShortageDialog(err.data.shortage);
      }
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleCancel(order) {
    setError('');
    setSuccess('');
    if (!window.confirm(`Cancel order ${order.order_number}? Reserved inventory will be released.`)) return;
    try {
      await api('POST', `/sales-orders/${order.id}/cancel`);
      setSuccess(`Order ${order.order_number} cancelled and reservation released.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDispatch(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await api('POST', `/sales-orders/${dispatchForm.order_id}/dispatch`, {
        vehicle_number: dispatchForm.vehicle_number,
        driver_name: dispatchForm.driver_name,
      });
      setSuccess(`Dispatch ${res.dispatch_number} processed for ${dispatchForm.order_number}.`);
      setDispatchForm(null);
      load();
      loadDispatches();
    } catch (err) {
      setError(err.message);
    }
  }

  const stats = {
    pending: orders.filter((o) => o.status === 'PENDING').length,
    confirmed: orders.filter((o) => o.status === 'CONFIRMED').length,
    dispatched: orders.filter((o) => o.status === 'DISPATCHED').length,
    value: orders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
  };

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle="Confirm, reserve stock and process dispatch"
        actions={
          <div className="header-actions">
            {isAdmin && (
              <button
                className={`btn ${showInventory ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { loadDispatches(); setShowInventory(!showInventory); }}
              >
                {showInventory ? 'Hide Inventory' : 'View Inventory'}
              </button>
            )}
            <button className="btn btn-outline" onClick={() => { loadDispatches(); load(); }}>⟳ Refresh</button>
          </div>
        }
      />

      <div className="page-body">
        {success && <div className="alert alert-success"><span>✓</span> {success}</div>}
        {error && <div className="alert alert-danger"><span>⚠️</span> {error}</div>}

        {!showInventory && (
          <div className="stats-row">
            <div className="stat-card stat-warning">
              <div className="stat-label">Pending</div>
              <div className="stat-value">{stats.pending}</div>
              <div className="stat-sub">Awaiting confirmation</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-label">Confirmed</div>
              <div className="stat-value">{stats.confirmed}</div>
              <div className="stat-sub">Stock reserved</div>
            </div>
            <div className="stat-card stat-primary">
              <div className="stat-label">Dispatched</div>
              <div className="stat-value">{stats.dispatched}</div>
              <div className="stat-sub">Delivered / in transit</div>
            </div>
            <div className="stat-card stat-danger">
              <div className="stat-label">Order Value</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{fmtMoney(stats.value)}</div>
              <div className="stat-sub">Total across orders</div>
            </div>
          </div>
        )}

        {showInventory && (
          <div className="card mb-4">
            <div className="card-header">
              <h3>Inventory Availability</h3>
              <span className="text-sm text-muted">Available = Physical − Reserved</span>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product Code</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Physical</th>
                    <th style={{ textAlign: 'right' }}>Reserved</th>
                    <th style={{ textAlign: 'right' }}>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((i) => {
                    const low = Number(i.available_quantity) <= 0;
                    return (
                      <tr key={i.id}>
                        <td className="font-mono">{i.product_code}</td>
                        <td className="font-semibold">{i.product_name}</td>
                        <td style={{ textAlign: 'right' }}>{i.physical_quantity}</td>
                        <td style={{ textAlign: 'right' }}>{i.reserved_quantity}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span
                            className={`badge ${low ? 'badge-rejected' : 'badge-accepted'}`}
                            style={{ fontSize: 13 }}
                          >
                            {i.available_quantity}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isAdmin && dispatchForm && (
          <div className="card mb-4">
            <div className="card-header"><h3>Dispatch {dispatchForm.order_number}</h3></div>
            <div className="card-body">
              <form onSubmit={handleDispatch}>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Vehicle Number</label>
                    <input
                      className="form-input"
                      value={dispatchForm.vehicle_number}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, vehicle_number: e.target.value })}
                      placeholder="e.g. MH-01-AB-1234"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Driver Name</label>
                    <input
                      className="form-input"
                      value={dispatchForm.driver_name}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, driver_name: e.target.value })}
                      placeholder="e.g. Ravi Kumar"
                      required
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <div className="text-sm text-muted">
                    Physical <strong>and</strong> reserved stock decrease on dispatch.
                  </div>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-outline" type="button" onClick={() => setDispatchForm(null)}>Cancel</button>
                  <button className="btn btn-success" type="submit">Process Dispatch</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h3>All Sales Orders</h3>
            <span className="text-sm text-muted">{orders.length} orders</span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Quotation</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6}>
                      <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <h3>No sales orders yet</h3>
                        <p>Convert an accepted quotation to create an order.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="cell-primary font-mono">{o.order_number}</td>
                    <td className="font-mono">{o.quotation_number}</td>
                    <td className="font-semibold">{o.company_name}</td>
                    <td>
                      <div className="product-chips">
                        {o.items.map((i) => (
                          <span className="product-chip" key={i.id}>
                            {i.product_name} × {i.quantity}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="cell-amount">{fmtMoney(o.total_amount)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    {isAdmin && (
                      <td>
                        <div className="cell-actions">
                          {o.status === 'PENDING' && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleConfirm(o)}
                                disabled={confirmingId === o.id}
                              >
                                {confirmingId === o.id ? 'Reserving…' : 'Confirm & Reserve'}
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleCancel(o)}>Cancel</button>
                            </>
                          )}
                          {o.status === 'CONFIRMED' && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => setDispatchForm({
                                  order_id: o.id,
                                  order_number: o.order_number,
                                  vehicle_number: '',
                                  driver_name: '',
                                })}
                              >
                                Dispatch
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleCancel(o)}>Cancel</button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {dispatches.length > 0 && (
          <div className="card mt-4">
            <div className="card-header">
              <h3>Dispatch Log</h3>
              <span className="text-sm text-muted">{dispatches.length} dispatches</span>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dispatch No</th>
                    <th>Sales Order</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((d) => (
                    <tr key={d.id}>
                      <td className="cell-primary font-mono">{d.dispatch_number}</td>
                      <td className="font-mono">{d.order_number}</td>
                      <td className="font-semibold">{d.company_name}</td>
                      <td>{new Date(d.dispatch_date).toLocaleDateString()}</td>
                      <td className="font-mono">{d.vehicle_number}</td>
                      <td>{d.driver_name}</td>
                      <td>
                        <div className="product-chips">
                          {d.items.map((i) => (
                            <span className="product-chip" key={i.id}>
                              {i.product_name} × {i.quantity}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {shortageDialog && (
          <div className="modal-overlay" onClick={() => setShortageDialog(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>⚠️ Insufficient Stock</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setShortageDialog(null)}>✕</button>
              </div>
              <div className="modal-body">
                <p className="text-sm text-muted mb-3">
                  This order cannot be confirmed — demand exceeds available inventory.
                </p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'right' }}>Required</th>
                      <th style={{ textAlign: 'right' }}>Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortageDialog.map((s, idx) => (
                      <tr key={idx}>
                        <td className="font-semibold">
                          #{s.product_id}
                          {inventory.find((i) => i.product_id === s.product_id)?.product_name
                            ? ` — ${inventory.find((i) => i.product_id === s.product_id).product_name}`
                            : ''}
                        </td>
                        <td style={{ textAlign: 'right' }}>{s.required}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{s.available}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-sm text-muted mt-3">
                  Tip: dispatch existing orders or adjust physical stock to free up availability.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setShortageDialog(null)}>Got it</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}