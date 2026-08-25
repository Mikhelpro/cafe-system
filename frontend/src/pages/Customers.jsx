import { useEffect, useState, useCallback } from 'react';
import { api, apiErrorMessage } from '../api.js';
import { formatMoney } from '../format.js';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [redeemFor, setRedeemFor] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState('');

  const load = useCallback(() => {
    api.get('/customers', { params: search ? { q: search } : {} }).then((res) => setCustomers(res.data));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function createCustomer(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/customers', form);
      setShowModal(false);
      setForm({ name: '', phone: '', email: '' });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function redeem(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/customers/${redeemFor.id}/redeem`, { points: +redeemPoints });
      setRedeemFor(null);
      setRedeemPoints('');
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Customers & Loyalty</div>
          <div className="page-subtitle">Customers earn 1 point per ETB 1 spent, redeemable for discounts.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add Customer</button>
      </div>

      <div className="form-group" style={{ maxWidth: 320 }}>
        <input className="form-input" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Phone</th><th>Loyalty Points</th><th>Total Spent</th><th></th></tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone || '—'}</td>
              <td>{c.loyalty_points}</td>
              <td>{formatMoney(c.total_spent)}</td>
              <td>
                <button className="btn btn-secondary btn-sm" onClick={() => setRedeemFor(c)} disabled={c.loyalty_points <= 0}>
                  Redeem Points
                </button>
              </td>
            </tr>
          ))}
          {customers.length === 0 && <tr><td colSpan={5}><div className="empty-state">No customers found.</div></td></tr>}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Customer</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={createCustomer}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {redeemFor && (
        <div className="modal-overlay" onClick={() => setRedeemFor(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Redeem Points — {redeemFor.name}</div>
            <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 14 }}>
              Available: {redeemFor.loyalty_points} points
            </div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={redeem}>
              <div className="form-group">
                <label className="form-label">Points to redeem</label>
                <input className="form-input" type="number" min="1" max={redeemFor.loyalty_points} required
                  value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setRedeemFor(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Redeem</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
