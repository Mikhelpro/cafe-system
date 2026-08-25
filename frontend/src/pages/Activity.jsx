import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const ACTION_LABELS = {
  login_success: 'Login Success',
  login_failed: 'Login Failed',
  order_created: 'Order Created',
  order_checkout: 'Order Checked Out',
  items_sold: 'Items Sold',
  order_held: 'Order Held',
  order_transferred: 'Order Transferred',
  order_resumed: 'Order Resumed',
  order_cancelled: 'Order Cancelled',
  order_voided: 'Order Voided',
  order_item_edited: 'Order Item Edited',
  order_item_removed: 'Order Item Removed',
  stock_adjusted: 'Stock Adjusted',
  staff_account_created: 'Staff Account Created',
  expense_added: 'Expense Added',
};

export default function Activity() {
  const [logType, setLogType] = useState('activity'); // 'activity' | 'auth'
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    api.get('/reports/activity', { params: { log_type: logType } }).then((res) => setLogs(res.data));
  }, [logType]);

  useEffect(() => { load(); setFilter('all'); }, [load]);

  const filteredLogs = filter === 'all' ? logs : logs.filter((l) => l.action === filter);
  const actionTypes = [...new Set(logs.map((l) => l.action))];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Activity Log</div>
          <div className="page-subtitle">Every action taken across the system — who did what, and when.</div>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab-btn' + (logType === 'activity' ? ' active' : '')} onClick={() => setLogType('activity')}>Activity Log</button>
        <button className={'tab-btn' + (logType === 'auth' ? ' active' : '')} onClick={() => setLogType('auth')}>Account Login Log</button>
      </div>

      <div className="tabs">
        <button className={'tab-btn' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All</button>
        {actionTypes.map((a) => (
          <button key={a} className={'tab-btn' + (filter === a ? ' active' : '')} onClick={() => setFilter(a)}>
            {ACTION_LABELS[a] || a}
          </button>
        ))}
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Date & Time</th><th>Action</th><th>Details</th><th>By</th><th>Role</th></tr>
        </thead>
        <tbody>
          {filteredLogs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.created_at).toLocaleString()}</td>
              <td>
                <span className={'badge ' + (log.action === 'login_failed' ? 'badge-cancelled' : 'badge-open')}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
              </td>
              <td>{log.details || '—'}</td>
              <td>{log.user_name || 'Unknown'}</td>
              <td style={{ textTransform: 'capitalize' }}>{log.user_role || '—'}</td>
            </tr>
          ))}
          {filteredLogs.length === 0 && (
            <tr><td colSpan={5}><div className="empty-state">No entries recorded yet.</div></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
