import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api.js';
import { formatMoney } from '../format.js';

export default function ZReport() {
  const [history, setHistory] = useState([]);
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function loadHistory() {
    api.get('/reports/z-report').then((res) => setHistory(res.data));
  }

  useEffect(() => { loadHistory(); }, []);

  async function generate() {
    setError(''); setLoading(true);
    try {
      const res = await api.post('/reports/z-report', { business_date: businessDate });
      setCurrent(res.data);
      loadHistory();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function printZ() {
    window.print();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Z Report</div>
          <div className="page-subtitle">End-of-day closing report — final sales totals by item, locked in with a unique report code.</div>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 20 }}>
        <div className="flex-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Business Date</label>
            <input className="form-input" type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Z Report'}
          </button>
        </div>
        {error && <div className="login-error" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Generating a Z Report is a permanent closing record — it's saved with a unique code and timestamp and can't be edited afterward.
        </div>
      </div>

      {current && (
        <div id="z-report-print-area" className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Z Report — {current.business_date}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Report Code: <strong>{current.report_code}</strong></div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Generated: {new Date(current.generated_at || current.created_at).toLocaleString()}</div>
            </div>
            <button className="btn btn-secondary btn-sm no-print" onClick={printZ}>Print</button>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Orders</div>
              <div className="stat-value">{current.total_orders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Revenue</div>
              <div className="stat-value">{formatMoney(current.total_revenue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cash Sales</div>
              <div className="stat-value">{formatMoney(current.cash_sales)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Transfer Sales</div>
              <div className="stat-value">{formatMoney(current.transfer_sales)}</div>
            </div>
          </div>

          <div className="section-title">Items Sold</div>
          <table className="data-table">
            <thead><tr><th>Item</th><th>Price</th><th>Quantity Sold</th><th>Revenue</th></tr></thead>
            <tbody>
              {current.items.map((i) => (
                <tr key={i.name}>
                  <td>{i.name}</td>
                  <td>{formatMoney(i.price)}</td>
                  <td>{i.qty_sold}</td>
                  <td>{formatMoney(i.revenue)}</td>
                </tr>
              ))}
              {current.items.length === 0 && <tr><td colSpan={4}><div className="empty-state">No sales recorded for this date.</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title">Past Z Reports</div>
      <table className="data-table">
        <thead><tr><th>Report Code</th><th>Business Date</th><th>Orders</th><th>Revenue</th><th>Generated</th></tr></thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id}>
              <td>{h.report_code}</td>
              <td>{h.business_date}</td>
              <td>{h.total_orders}</td>
              <td>{formatMoney(h.total_revenue)}</td>
              <td>{new Date(h.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {history.length === 0 && <tr><td colSpan={5}><div className="empty-state">No Z Reports generated yet.</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
