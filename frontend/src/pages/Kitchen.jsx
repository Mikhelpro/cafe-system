import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export default function Kitchen() {
  const [queue, setQueue] = useState([]);
  const [station, setStation] = useState('all');

  const load = useCallback(() => {
    api.get('/orders/kitchen/queue', { params: station === 'all' ? {} : { station } })
      .then((res) => setQueue(res.data));
  }, [station]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function updateStatus(itemId, status) {
    await api.patch(`/orders/items/${itemId}/status`, { status });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Kitchen / Bar Display</div>
          <div className="page-subtitle">Live order tickets — auto-refreshes every 5 seconds.</div>
        </div>
      </div>

      <div className="tabs">
        {['all', 'kitchen', 'bar'].map((s) => (
          <button key={s} className={'tab-btn' + (station === s ? ' active' : '')} onClick={() => setStation(s)}>
            {s === 'all' ? 'All Stations' : s === 'kitchen' ? 'Kitchen' : 'Bar'}
          </button>
        ))}
      </div>

      <div className="kds-grid">
        {queue.map((item) => (
          <div key={item.id} className={'kds-ticket' + (item.status === 'ready' ? ' ready' : '')}>
            <div className="kds-ticket-header">
              <span>Order #{item.order_id} · {item.order_type.replace('_', ' ')}</span>
              <span>{new Date(item.order_time).toLocaleTimeString()}</span>
            </div>
            <div className="kds-item-name">{item.qty}× {item.item_name}</div>
            {item.notes && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Note: {item.notes}</div>}
            <div className="flex-row" style={{ marginTop: 12 }}>
              {item.status === 'pending' && (
                <button className="btn btn-secondary btn-sm flex-1" onClick={() => updateStatus(item.id, 'preparing')}>
                  Start Preparing
                </button>
              )}
              {item.status === 'preparing' && (
                <button className="btn btn-primary btn-sm flex-1" onClick={() => updateStatus(item.id, 'ready')}>
                  Mark Ready
                </button>
              )}
            </div>
          </div>
        ))}
        {queue.length === 0 && <div className="empty-state">No pending items — kitchen is caught up.</div>}
      </div>
    </div>
  );
}
