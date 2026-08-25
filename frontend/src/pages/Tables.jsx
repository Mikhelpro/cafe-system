import { useEffect, useState, useCallback } from 'react';
import { api, apiErrorMessage } from '../api.js';
import Badge from '../components/Badge.jsx';

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2, reservation_time: '', table_id: '', notes: '' });

  const load = useCallback(() => {
    api.get('/tables').then((res) => setTables(res.data));
    api.get('/reservations').then((res) => setReservations(res.data));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createReservation(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/reservations', { ...form, table_id: form.table_id || null });
      setShowModal(false);
      setForm({ customer_name: '', phone: '', party_size: 2, reservation_time: '', table_id: '', notes: '' });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function updateReservationStatus(id, status) {
    await api.patch(`/reservations/${id}`, { status });
    load();
  }

  async function updateTableStatus(id, status) {
    await api.patch(`/tables/${id}`, { status });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tables & Reservations</div>
          <div className="page-subtitle">Manage seating and upcoming bookings.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>New Reservation</button>
      </div>

      <div className="section-title">Floor Plan</div>
      <div className="stat-grid">
        {tables.map((t) => (
          <div key={t.id} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{t.name}</strong>
              <Badge status={t.status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Seats {t.capacity}</div>
            <div className="flex-row" style={{ marginTop: 10 }}>
              {t.status !== 'free' && (
                <button className="btn btn-secondary btn-sm flex-1" onClick={() => updateTableStatus(t.id, 'free')}>Free up</button>
              )}
              {t.status === 'free' && (
                <button className="btn btn-secondary btn-sm flex-1" onClick={() => updateTableStatus(t.id, 'occupied')}>Seat walk-in</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">Reservations</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Customer</th><th>Party</th><th>Table</th><th>Time</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((r) => (
            <tr key={r.id}>
              <td>{r.customer_name}{r.phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.phone}</div>}</td>
              <td>{r.party_size}</td>
              <td>{tables.find((t) => t.id === r.table_id)?.name || '—'}</td>
              <td>{new Date(r.reservation_time).toLocaleString()}</td>
              <td><Badge status={r.status === 'booked' ? 'open' : r.status === 'seated' ? 'ready' : r.status} /></td>
              <td>
                {r.status === 'booked' && (
                  <div className="flex-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => updateReservationStatus(r.id, 'seated')}>Seat</button>
                    <button className="btn btn-danger btn-sm" onClick={() => updateReservationStatus(r.id, 'cancelled')}>Cancel</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {reservations.length === 0 && (
            <tr><td colSpan={6}><div className="empty-state">No reservations yet.</div></td></tr>
          )}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New Reservation</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={createReservation}>
              <div className="form-group">
                <label className="form-label">Customer name</label>
                <input className="form-input" required value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Party size</label>
                <input className="form-input" type="number" min="1" value={form.party_size}
                  onChange={(e) => setForm({ ...form, party_size: +e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Table (optional)</label>
                <select className="form-select" value={form.table_id}
                  onChange={(e) => setForm({ ...form, table_id: e.target.value })}>
                  <option value="">No preference</option>
                  {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date & time</label>
                <input className="form-input" type="datetime-local" required value={form.reservation_time}
                  onChange={(e) => setForm({ ...form, reservation_time: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Reservation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
