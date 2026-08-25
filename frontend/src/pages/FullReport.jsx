import { useState } from 'react';
import { api } from '../api.js';
import { formatMoney } from '../format.js';

const REPORT_TYPES = {
  all: { label: 'Everything', keys: ['orders', 'expenses', 'stock_movements', 'activity'] },
  sold: { label: 'Sales Only (Orders)', keys: ['orders'] },
  activity: { label: 'Activity Log Only', keys: ['activity'] },
  expenses: { label: 'Expenses Only', keys: ['expenses'] },
  stock: { label: 'Stock Movements Only', keys: ['stock_movements'] },
};

export default function FullReport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadType, setDownloadType] = useState('all');

  async function generate() {
    setLoading(true);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/reports/export', { params });
      setReport(res.data);
    } finally {
      setLoading(false);
    }
  }

  function downloadJson() {
    const { keys, label } = REPORT_TYPES[downloadType];
    const payload = {
      generated_at: report.generated_at,
      range: report.range,
      report_type: label,
    };
    if (downloadType === 'all') payload.summary = report.summary;
    for (const key of keys) payload[key] = report[key];

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piassa-plate-${downloadType}-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Full Report</div>
          <div className="page-subtitle">Everything recorded in the system — orders, expenses, stock, and activity — for any date range.</div>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 20 }}>
        <div className="flex-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From</label>
            <input className="form-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To</label>
            <input className="form-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
          {report && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Download</label>
                <select className="form-select" value={downloadType} onChange={(e) => setDownloadType(e.target.value)}>
                  {Object.entries(REPORT_TYPES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={downloadJson}>Download (JSON)</button>
              <button className="btn btn-secondary" onClick={printReport}>Print / Save as PDF</button>
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Leave dates blank to include everything ever recorded. Use "Print / Save as PDF" to get a clean printable copy.
        </div>
      </div>

      {report && (
        <div id="full-report-print-area">
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Orders</div>
              <div className="stat-value">{report.summary.total_orders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Completed</div>
              <div className="stat-value">{report.summary.completed_orders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cancelled / Void</div>
              <div className="stat-value">{report.summary.cancelled_orders + report.summary.void_orders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Revenue</div>
              <div className="stat-value">{formatMoney(report.summary.revenue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Expenses</div>
              <div className="stat-value">{formatMoney(report.summary.total_expenses)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Net</div>
              <div className="stat-value">{formatMoney(report.summary.net)}</div>
            </div>
          </div>

          <div className="section-title">Orders ({report.orders.length})</div>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Date</th><th>Table</th><th>Waiter</th><th>Status</th><th>Items</th><th>Total</th></tr>
            </thead>
            <tbody>
              {report.orders.map((o) => (
                <tr key={o.id}>
                  <td>#{o.id}</td>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                  <td>{o.table_id || '—'}</td>
                  <td>{o.waiter_name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{o.status}</td>
                  <td>{o.items.map((it) => `${it.qty}× ${it.item_name}`).join(', ')}</td>
                  <td>{formatMoney(o.total)}</td>
                </tr>
              ))}
              {report.orders.length === 0 && <tr><td colSpan={7}><div className="empty-state">No orders in this range.</div></td></tr>}
            </tbody>
          </table>

          <div className="section-title">Expenses ({report.expenses.length})</div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Description</th><th>By</th></tr></thead>
            <tbody>
              {report.expenses.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString()}</td>
                  <td>{e.category}</td>
                  <td>{formatMoney(e.amount)}</td>
                  <td>{e.description || '—'}</td>
                  <td>{e.created_by_name || '—'}</td>
                </tr>
              ))}
              {report.expenses.length === 0 && <tr><td colSpan={5}><div className="empty-state">No expenses in this range.</div></td></tr>}
            </tbody>
          </table>

          <div className="section-title">Stock Movements ({report.stock_movements.length})</div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Item</th><th>Change</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {report.stock_movements.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleString()}</td>
                  <td>{m.item_name}</td>
                  <td style={{ color: m.change_qty >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {m.change_qty >= 0 ? '+' : ''}{m.change_qty} {m.unit}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{m.reason}</td>
                  <td>{m.user_name || '—'}</td>
                </tr>
              ))}
              {report.stock_movements.length === 0 && <tr><td colSpan={5}><div className="empty-state">No stock movements in this range.</div></td></tr>}
            </tbody>
          </table>

          <div className="section-title">Activity Log ({report.activity.length})</div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Action</th><th>Details</th><th>By</th></tr></thead>
            <tbody>
              {report.activity.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.action}</td>
                  <td>{a.details || '—'}</td>
                  <td>{a.user_name || 'System'}</td>
                </tr>
              ))}
              {report.activity.length === 0 && <tr><td colSpan={4}><div className="empty-state">No activity in this range.</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
