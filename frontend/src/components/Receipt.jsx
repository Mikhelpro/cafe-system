import { useRef } from 'react';
import { formatMoney } from '../format.js';

export default function Receipt({ order, storeName = 'Piassa Plate Cafe & Restaurant', onClose }) {
  const printRef = useRef(null);

  function handlePrint() {
    window.print();
  }

  if (!order) return null;

  return (
    <div className="modal-overlay receipt-overlay" onClick={onClose}>
      <div className="modal-box receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div id="receipt-print-area" ref={printRef} className="receipt-paper">
          <div className="receipt-center receipt-store-name">{storeName}</div>
          <div className="receipt-center receipt-small">Order #{order.id}</div>
          {(order.table || order.waiter) && (
            <div className="receipt-center receipt-small">
              {order.table ? `Table: ${order.table}` : ''}{order.table && order.waiter ? ' · ' : ''}{order.waiter ? `Waiter: ${order.waiter}` : ''}
            </div>
          )}
          <div className="receipt-center receipt-small">{new Date().toLocaleString()}</div>
          <div className="receipt-divider" />
          {order.items.map((item) => (
            <div className="receipt-line" key={item.menu_item_id}>
              <span>{item.qty}× {item.name}</span>
              <span>{formatMoney(item.price * item.qty)}</span>
            </div>
          ))}
          <div className="receipt-divider" />
          <div className="receipt-line">
            <span>Subtotal</span><span>{formatMoney(order.subtotal)}</span>
          </div>
          <div className="receipt-line">
            <span>VAT (15%)</span><span>{formatMoney(order.tax)}</span>
          </div>
          <div className="receipt-line receipt-total">
            <span>Total</span><span>{formatMoney(order.total)}</span>
          </div>
          <div className="receipt-divider" />
          <div className="receipt-center receipt-small">Thank you for visiting!</div>
        </div>

        <div className="modal-actions receipt-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handlePrint}>Print Receipt</button>
        </div>
      </div>
    </div>
  );
}
