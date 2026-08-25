import { useEffect, useState, useCallback } from 'react';
import { api, apiErrorMessage } from '../api.js';
import { formatMoney } from '../format.js';

export default function Finance() {
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ category: '', amount: '', description: '' });

  const load = useCallback(() => {
    api.get('/finance/summary').then((res) => setSummary(res.data));
    api.get('/finance/expenses').then((res) => setExpenses(res.data));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createExpense(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/finance/expenses', { ...form, amount: +form.amount });
      setShowModal(false);
      setForm({ category: '', amount: '', description: '' });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function deleteExpense(id) {
    await api.delete(`/finance/expenses/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Finance</div>
          <div className="page-subtitle">Profit & loss overview and expense tracking.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add Expense</button>
      </div>

      {summary && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Revenue (all time)</div>
            <div className="stat-value">{formatMoney(summary.revenue)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cost of Goods Sold</div>
            <div className="stat-value">{formatMoney(summary.cogs)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Operating Expenses</div>
            <div className="stat-value">{formatMoney(summary.expenses)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Gross Profit</div>
            <div className="stat-value">{formatMoney(summary.gross_profit)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Net Profit</div>
            <div className={`stat-value ${summary.net_profit < 0 ? 'warn' : ''}`}>{formatMoney(summary.net_profit)}</div>
          </div>
        </div>
      )}

      <div className="section-title">Expenses</div>
      <table className="data-table">
        <thead><tr><th>Category</th><th>Amount</th><th>Description</th><th>Date</th><th></th></tr></thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td>{e.category}</td>
              <td>{formatMoney(e.amount)}</td>
              <td>{e.description || '—'}</td>
              <td>{new Date(e.created_at).toLocaleDateString()}</td>
              <td><button className="btn btn-danger btn-sm" onClick={() => deleteExpense(e.id)}>Delete</button></td>
            </tr>
          ))}
          {expenses.length === 0 && <tr><td colSpan={5}><div className="empty-state">No expenses recorded.</div></td></tr>}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Expense</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={createExpense}>
              <div className="form-group">
                <label className="form-label">Category</label>
                <input className="form-input" required placeholder="Rent, Utilities, Supplies..." value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (ETB)</label>
                <input className="form-input" type="number" step="0.01" required value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
