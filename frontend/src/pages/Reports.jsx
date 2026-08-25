import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '../format.js';

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [topItems, setTopItems] = useState([]);

  useEffect(() => {
    api.get('/reports/sales').then((res) => setSales(res.data));
    api.get('/reports/top-items').then((res) => setTopItems(res.data));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Sales trends and best-selling items.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Daily Revenue</div>
        {sales.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5DBC9" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#C9822C" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="empty-state">No completed sales yet.</div>}
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Top Selling Items</div>
        {topItems.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topItems} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5DBC9" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
              <Tooltip />
              <Bar dataKey="qty_sold" fill="#C9822C" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="empty-state">No sales data yet.</div>}
      </div>
    </div>
  );
}
