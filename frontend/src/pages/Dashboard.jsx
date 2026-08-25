import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatMoney } from '../format.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/dashboard')
      .then((res) => setStats(res.data))
      .catch(() => setError('Could not load dashboard stats.'));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Welcome back, {user.name.split(' ')[0]}</div>
          <div className="page-subtitle">Here's what's happening at your café today.</div>
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

      {stats && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Today's Revenue</div>
            <div className="stat-value">{formatMoney(stats.todayRevenue)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Orders Completed Today</div>
            <div className="stat-value">{stats.todayOrders}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open Orders</div>
            <div className="stat-value">{stats.openOrders}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tables Occupied</div>
            <div className="stat-value">{stats.occupiedTables} / {stats.totalTables}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Low Stock Items</div>
            <div className={`stat-value ${stats.lowStock > 0 ? 'warn' : ''}`}>{stats.lowStock}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Registered Customers</div>
            <div className="stat-value">{stats.activeCustomers}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Quick tips</div>
        <ul style={{ color: 'var(--text-muted)', lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Use <strong>POS</strong> to take new orders — inventory is deducted automatically based on recipes.</li>
          <li>Check <strong>Kitchen / Bar</strong> for live order tickets that need preparing.</li>
          <li>Visit <strong>Reports</strong> for sales trends and top-selling items.</li>
          <li>Set reorder levels in <strong>Inventory</strong> to get low-stock alerts here.</li>
        </ul>
      </div>
    </div>
  );
}
