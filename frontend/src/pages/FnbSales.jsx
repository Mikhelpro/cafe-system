import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatMoney } from '../format.js';

export default function FnbSales() {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    api.get('/reports/fnb-sales').then((res) => setItems(res.data));
  }, []);

  const categories = [...new Set(items.map((i) => i.category_name).filter(Boolean))];
  const filtered = category === 'all' ? items : items.filter((i) => i.category_name === category);
  const totalRevenue = filtered.reduce((s, i) => s + i.revenue, 0);
  const totalQty = filtered.reduce((s, i) => s + i.qty_sold, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">F&B Sales</div>
          <div className="page-subtitle">How much of each item has sold, and at what price.</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Units Sold</div>
          <div className="stat-value">{totalQty}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">{formatMoney(totalRevenue)}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab-btn' + (category === 'all' ? ' active' : '')} onClick={() => setCategory('all')}>All</button>
        {categories.map((c) => (
          <button key={c} className={'tab-btn' + (category === c ? ' active' : '')} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Item</th><th>Category</th><th>Price (ETB)</th><th>Quantity Sold</th><th>Revenue (ETB)</th></tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.name}>
              <td><strong>{i.name}</strong></td>
              <td>{i.category_name || '—'}</td>
              <td>{formatMoney(i.price)}</td>
              <td>{i.qty_sold}</td>
              <td>{formatMoney(i.revenue)}</td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={5}><div className="empty-state">No sales data yet.</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
