import { useEffect, useState, useMemo } from 'react';
import { api, apiErrorMessage } from '../api.js';
import Receipt from '../components/Receipt.jsx';
import { formatMoney } from '../format.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function POS() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]); // [{menu_item_id, name, price, qty}]
  const [tables, setTables] = useState([]);
  const [tableId, setTableId] = useState('');
  const [waiterName, setWaiterName] = useState('');
  const [orderType, setOrderType] = useState('dine_in');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [placing, setPlacing] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [view, setView] = useState('new'); // 'new' | 'held'
  const [heldOrders, setHeldOrders] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [transferFor, setTransferFor] = useState(null);
  const [transferTo, setTransferTo] = useState('');
  const [voidFor, setVoidFor] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [addItemFor, setAddItemFor] = useState(null);
  const [addItemCategory, setAddItemCategory] = useState('all');
  const [addItemSearch, setAddItemSearch] = useState('');
  const [addItemCart, setAddItemCart] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [showBackdated, setShowBackdated] = useState(false);
  const [backdatedDate, setBackdatedDate] = useState('');
  const [backdatedCart, setBackdatedCart] = useState([]);
  const [backdatedCategory, setBackdatedCategory] = useState('all');
  const [backdatedMethod, setBackdatedMethod] = useState('cash');
  const [backdatedWaiter, setBackdatedWaiter] = useState('');
  const [showHandover, setShowHandover] = useState(false);
  const [handoverPreview, setHandoverPreview] = useState(null);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handoverSubmitted, setHandoverSubmitted] = useState(null);

  useEffect(() => {
    api.get('/menu/items').then((res) => setItems(res.data.filter((i) => i.is_active)));
    api.get('/menu/categories').then((res) => setCategories(res.data));
    api.get('/tables').then((res) => setTables(res.data));
    api.get('/auth/staff-list').then((res) => setStaffList(res.data));
    api.get('/waiters').then((res) => setWaiters(res.data));
  }, []);

  function loadHeld() {
    api.get('/orders', { params: { status: 'on_hold' } }).then((res) => setHeldOrders(res.data));
  }

  useEffect(() => { if (view === 'held') loadHeld(); }, [view]);

  const filteredItems = useMemo(() => {
    let result = activeCategory === 'all' ? items : items.filter((i) => i.category_id === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    return result;
  }, [items, activeCategory, searchQuery]);

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) => (c.menu_item_id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  }

  function changeQty(menuItemId, delta) {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_item_id === menuItemId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const tax = +(subtotal * 0.15).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  async function lookupCustomer() {
    if (!customerPhone) { setCustomer(null); return; }
    try {
      const res = await api.get('/customers', { params: { q: customerPhone } });
      setCustomer(res.data[0] || null);
    } catch {
      setCustomer(null);
    }
  }

  function resetCart() {
    setCart([]);
    setCustomer(null);
    setCustomerPhone('');
    setTableId('');
    setWaiterName('');
  }

  async function placeOrderAndCheckout(method) {
    if (!cart.length) return;
    if (!tableId) { setError('Please select a table before placing the order.'); return; }
    if (!waiterName.trim()) { setError('Please enter the waiter\'s name before placing the order.'); return; }
    setError(''); setSuccess(''); setPlacing(true);
    try {
      const orderRes = await api.post('/orders', {
        table_id: tableId,
        customer_id: customer?.id || null,
        order_type: orderType,
        waiter_name: waiterName.trim(),
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty })),
      });
      await api.post(`/orders/${orderRes.data.id}/checkout`, { method });
      setSuccess(`Order #${orderRes.data.id} placed and paid (${formatMoney(total)}).`);
      setReceiptOrder({
        id: orderRes.data.id,
        table: tables.find((t) => t.id === Number(tableId))?.name,
        waiter: waiterName.trim(),
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, name: c.name, price: c.price, qty: c.qty })),
        subtotal,
        tax,
        total,
      });
      resetCart();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPlacing(false);
    }
  }

  async function holdOrder() {
    if (!cart.length) return;
    if (!tableId) { setError('Please select a table before holding the order.'); return; }
    if (!waiterName.trim()) { setError('Please enter the waiter\'s name before holding the order.'); return; }
    setError(''); setPlacing(true);
    try {
      const orderRes = await api.post('/orders', {
        table_id: tableId,
        customer_id: customer?.id || null,
        order_type: orderType,
        waiter_name: waiterName.trim(),
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty })),
      });
      await api.post(`/orders/${orderRes.data.id}/hold`);
      setSuccess(`Order #${orderRes.data.id} put on hold — visible under "Held Orders" for any cashier to pick up.`);
      resetCart();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPlacing(false);
    }
  }

  async function payHeldOrder(order, method) {
    setError('');
    try {
      await api.post(`/orders/${order.id}/resume`);
      await api.post(`/orders/${order.id}/checkout`, { method });
      setSuccess(`Order #${order.id} paid (${formatMoney(order.total)}).`);
      loadHeld();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function submitTransfer(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/orders/${transferFor.id}/transfer`, { to_user_id: transferTo });
      setTransferFor(null);
      setTransferTo('');
      loadHeld();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function submitVoid(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/orders/${voidFor.id}/void`, { reason: voidReason });
      setVoidFor(null);
      setVoidReason('');
      loadHeld();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function openBackdated() {
    setShowBackdated(true);
    setBackdatedDate('');
    setBackdatedCart([]);
    setBackdatedCategory('all');
    setBackdatedMethod('cash');
    setBackdatedWaiter('');
  }

  function addToBackdatedCart(item) {
    setBackdatedCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) => (c.menu_item_id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  }

  function changeBackdatedQty(menuItemId, delta) {
    setBackdatedCart((prev) =>
      prev.map((c) => (c.menu_item_id === menuItemId ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0)
    );
  }

  async function submitBackdated() {
    setError('');
    if (!backdatedDate) { setError('Please select a date for this sale.'); return; }
    if (!backdatedCart.length) { setError('Please add at least one item.'); return; }
    try {
      await api.post('/orders/backdated', {
        sale_date: backdatedDate,
        items: backdatedCart.map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty })),
        method: backdatedMethod,
        waiter_name: backdatedWaiter || undefined,
      });
      setSuccess(`Sale for ${backdatedDate} recorded successfully.`);
      setShowBackdated(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function addToAddItemCart(item) {
    setAddItemCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) => (c.menu_item_id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  }

  function changeAddItemQty(menuItemId, delta) {
    setAddItemCart((prev) =>
      prev.map((c) => (c.menu_item_id === menuItemId ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0)
    );
  }

  function openAddItem(order) {
    setAddItemFor(order);
    setAddItemCart([]);
    setAddItemCategory('all');
    setAddItemSearch('');
  }

  async function submitAddItem() {
    setError('');
    if (!addItemCart.length) { setError('Please add at least one item.'); return; }
    try {
      for (const c of addItemCart) {
        await api.post(`/orders/${addItemFor.id}/items`, { menu_item_id: c.menu_item_id, qty: c.qty });
      }
      setSuccess(`Added ${addItemCart.reduce((s, c) => s + c.qty, 0)} item(s) to Order #${addItemFor.id} (waiter: ${addItemFor.waiter_name || '—'}).`);
      setAddItemFor(null);
      setAddItemCart([]);
      loadHeld();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function editItemQty(item, newQty) {
    if (newQty < 1) return;
    setError('');
    try {
      await api.patch(`/orders/items/${item.id}/qty`, { qty: newQty });
      loadHeld();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function removeHeldItem(item) {
    setError('');
    try {
      await api.delete(`/orders/items/${item.id}`);
      loadHeld();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function cancelHeldOrder(order) {
    setError('');
    try {
      await api.patch(`/orders/${order.id}/status`, { status: 'cancelled' });
      setSuccess(`Order #${order.id} cancelled.`);
      loadHeld();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function openHandover() {
    setError('');
    try {
      const res = await api.get('/shift-handovers/preview');
      setHandoverPreview(res.data);
      setShowHandover(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function submitHandover(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/shift-handovers', { ...handoverPreview, notes: handoverNotes });
      setHandoverSubmitted({ ...handoverPreview, notes: handoverNotes });
      setShowHandover(false);
      setHandoverNotes('');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Point of Sale</div>
          <div className="page-subtitle">Take orders and check out customers.</div>
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}
      {success && <div className="card" style={{ color: 'var(--success)', marginBottom: 16 }}>{success}</div>}

      <div className="tabs">
        <button className={'tab-btn' + (view === 'new' ? ' active' : '')} onClick={() => setView('new')}>New Order</button>
        <button className={'tab-btn' + (view === 'held' ? ' active' : '')} onClick={() => setView('held')}>Held Orders</button>
        {user.role === 'owner' && (
          <button className="btn btn-secondary btn-sm" onClick={openBackdated}>Add Past Sale</button>
        )}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={openHandover}>End Shift (X Report)</button>
      </div>

      {view === 'held' && (
        <table className="data-table">
          <thead>
            <tr><th>Order</th><th>Table</th><th>Waiter</th><th>Held By</th><th>Items</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {heldOrders.map((o) => (
              <tr key={o.id}>
                <td>#{o.id}</td>
                <td>{tables.find((t) => t.id === o.table_id)?.name || '—'}</td>
                <td>{o.waiter_name || '—'}</td>
                <td>{staffList.find((s) => s.id === o.held_by)?.name || '—'}</td>
                <td>
                  {(o.items || []).map((it) => (
                    <div key={it.id} className="flex-row" style={{ fontSize: 12, alignItems: 'center', marginBottom: 4 }}>
                      <button className="qty-btn" onClick={() => editItemQty(it, it.qty - 1)} disabled={it.qty <= 1}>−</button>
                      <span style={{ minWidth: 18, textAlign: 'center' }}>{it.qty}</span>
                      <button className="qty-btn" onClick={() => editItemQty(it, it.qty + 1)}>+</button>
                      <span style={{ marginLeft: 4 }}>{it.item_name}</span>
                      <button className="btn btn-danger btn-sm" style={{ marginLeft: 6, padding: '2px 6px' }} onClick={() => removeHeldItem(it)}>✕</button>
                    </div>
                  ))}
                  {(!o.items || o.items.length === 0) && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td>{formatMoney(o.total)}</td>
                <td>
                  <div className="flex-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => openAddItem(o)}>Add Item</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => payHeldOrder(o, 'cash')}>Pay Cash</button>
                    <button className="btn btn-primary btn-sm" onClick={() => payHeldOrder(o, 'transfer')}>Pay Transfer</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setTransferFor(o)}>Reassign</button>
                    <button className="btn btn-danger btn-sm" onClick={() => cancelHeldOrder(o)}>Cancel</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setVoidFor(o)}>Void</button>
                  </div>
                </td>
              </tr>
            ))}
            {heldOrders.length === 0 && (
              <tr><td colSpan={7}><div className="empty-state">No held orders — unpaid orders put on hold (e.g. at shift change) appear here.</div></td></tr>
            )}
          </tbody>
        </table>
      )}

      {view === 'new' && (
      <>
      <div className="form-group" style={{ maxWidth: 320, marginBottom: 12 }}>
        <input
          className="form-input"
          placeholder="Search menu items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="tabs">
        <button
          className={'tab-btn' + (activeCategory === 'all' ? ' active' : '')}
          onClick={() => setActiveCategory('all')}
        >All</button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={'tab-btn' + (activeCategory === c.id ? ' active' : '')}
            onClick={() => setActiveCategory(c.id)}
          >{c.name}</button>
        ))}
      </div>

      <div className="pos-layout">
        <div className="menu-grid">
          {filteredItems.map((item) => (
            <button key={item.id} className="menu-tile" onClick={() => addToCart(item)}>
              <div className="menu-tile-name">{item.name}</div>
              <div className="menu-tile-price">{formatMoney(item.price)}</div>
              <div className="menu-tile-station">{item.station}</div>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <div className="empty-state">No menu items in this category.</div>
          )}
        </div>

        <div className="cart-panel">
          <div className="cart-header">Current Order</div>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <select className="form-select" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="dine_in">Dine In</option>
                <option value="takeaway">Takeaway</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">Table (required)</label>
              <select className="form-select" required value={tableId} onChange={(e) => setTableId(e.target.value)}>
                <option value="">Select a table...</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.status === 'occupied'}>
                    {t.name} ({t.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">Waiter (required)</label>
              <select className="form-select" required value={waiterName} onChange={(e) => setWaiterName(e.target.value)}>
                <option value="">Select waiter...</option>
                {waiters.map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}
              </select>
              {waiters.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  No waiters set up yet — ask a manager to add them in Staff & Shifts → Waiters.
                </div>
              )}
            </div>
            <div className="flex-row" style={{ marginTop: 8 }}>
              <input
                className="form-input flex-1"
                placeholder="Customer phone (optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                onBlur={lookupCustomer}
              />
            </div>
            {customer && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                {customer.name} — {customer.loyalty_points} pts
              </div>
            )}
            {customerPhone && !customer && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                No existing customer found — add one in Customers page for loyalty tracking.
              </div>
            )}
          </div>

          <div className="cart-items">
            {cart.length === 0 && <div className="empty-state">Cart is empty. Tap items to add.</div>}
            {cart.map((c) => (
              <div key={c.menu_item_id} className="cart-item">
                <div>
                  <div>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatMoney(c.price)} each</div>
                </div>
                <div className="cart-item-qty">
                  <button className="qty-btn" onClick={() => changeQty(c.menu_item_id, -1)}>−</button>
                  <span>{c.qty}</span>
                  <button className="qty-btn" onClick={() => changeQty(c.menu_item_id, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-footer">
            <div className="cart-total-row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
            <div className="cart-total-row"><span>VAT (15%)</span><span>{formatMoney(tax)}</span></div>
            <div className="cart-total-row grand"><span>Total</span><span>{formatMoney(total)}</span></div>
            <div className="flex-row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-secondary flex-1"
                disabled={!cart.length || placing}
                onClick={() => placeOrderAndCheckout('cash')}
              >Pay Cash</button>
              <button
                className="btn btn-primary flex-1"
                disabled={!cart.length || placing}
                onClick={() => placeOrderAndCheckout('transfer')}
              >Pay Transfer</button>
            </div>
            <div className="flex-row" style={{ marginTop: 8 }}>
              <button
                className="btn btn-secondary flex-1"
                disabled={!cart.length || placing}
                onClick={holdOrder}
              >Hold Order (pay later)</button>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {receiptOrder && (
        <Receipt order={receiptOrder} onClose={() => setReceiptOrder(null)} />
      )}

      {transferFor && (
        <div className="modal-overlay" onClick={() => setTransferFor(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Reassign Order #{transferFor.id} to Another Staff Member</div>
            <form onSubmit={submitTransfer}>
              <div className="form-group">
                <label className="form-label">Transfer to</label>
                <select className="form-select" required value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                  <option value="">Select staff member...</option>
                  {staffList.filter((s) => s.role === 'cashier' || s.role === 'owner' || s.role === 'manager').map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setTransferFor(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {voidFor && (
        <div className="modal-overlay" onClick={() => setVoidFor(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Void Order #{voidFor.id}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              This restores any ingredients already deducted for this order and cannot be undone.
            </div>
            <form onSubmit={submitVoid}>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-input" required value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Customer changed mind, order entered by mistake..." />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setVoidFor(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger">Void Order</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {addItemFor && (
        <div className="modal-overlay" onClick={() => setAddItemFor(null)}>
          <div className="modal-box" style={{ width: '90vw', maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Items — Order #{addItemFor.id}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Table: {tables.find((t) => t.id === addItemFor.table_id)?.name || '—'} · Waiter: {addItemFor.waiter_name || '—'}
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <input
                className="form-input"
                placeholder="Search menu items..."
                value={addItemSearch}
                onChange={(e) => setAddItemSearch(e.target.value)}
              />
            </div>

            <div className="tabs">
              <button
                className={'tab-btn' + (addItemCategory === 'all' ? ' active' : '')}
                onClick={() => setAddItemCategory('all')}
              >All</button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={'tab-btn' + (addItemCategory === c.id ? ' active' : '')}
                  onClick={() => setAddItemCategory(c.id)}
                >{c.name}</button>
              ))}
            </div>

            <div className="pos-layout" style={{ height: '55vh' }}>
              <div className="menu-grid">
                {(addItemCategory === 'all' ? items : items.filter((i) => i.category_id === addItemCategory))
                  .filter((i) => !addItemSearch.trim() || i.name.toLowerCase().includes(addItemSearch.trim().toLowerCase()))
                  .map((item) => (
                  <button key={item.id} className="menu-tile" onClick={() => addToAddItemCart(item)}>
                    <div className="menu-tile-name">{item.name}</div>
                    <div className="menu-tile-price">{formatMoney(item.price)}</div>
                    <div className="menu-tile-station">{item.station}</div>
                  </button>
                ))}
              </div>

              <div className="cart-panel">
                <div className="cart-header">Items to Add</div>
                <div className="cart-items">
                  {addItemCart.length === 0 && <div className="empty-state">Tap items to add them to this order.</div>}
                  {addItemCart.map((c) => (
                    <div key={c.menu_item_id} className="cart-item">
                      <div>
                        <div>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatMoney(c.price)} each</div>
                      </div>
                      <div className="cart-item-qty">
                        <button className="qty-btn" onClick={() => changeAddItemQty(c.menu_item_id, -1)}>−</button>
                        <span>{c.qty}</span>
                        <button className="qty-btn" onClick={() => changeAddItemQty(c.menu_item_id, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-footer">
                  <div className="modal-actions" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setAddItemFor(null)}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={!addItemCart.length} onClick={submitAddItem}>
                      Add {addItemCart.length ? `(${addItemCart.reduce((s, c) => s + c.qty, 0)} item${addItemCart.reduce((s, c) => s + c.qty, 0) === 1 ? '' : 's'})` : ''} to Order
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showHandover && handoverPreview && (
        <div className="modal-overlay" onClick={() => setShowHandover(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">End Shift — X Report</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Summary of everything done this session. Review, add notes, then submit — the next cashier or manager can see this handover.
            </div>
            <table className="data-table" style={{ marginBottom: 14 }}>
              <tbody>
                <tr><td>Orders Completed</td><td>{handoverPreview.orders_completed}</td></tr>
                <tr><td>Total Sales</td><td>{formatMoney(handoverPreview.total_sales)}</td></tr>
                <tr><td>Cash Sales</td><td>{formatMoney(handoverPreview.cash_sales)}</td></tr>
                <tr><td>Transfer Sales</td><td>{formatMoney(handoverPreview.transfer_sales)}</td></tr>
                <tr><td>Orders Held (unpaid, passed on)</td><td>{handoverPreview.orders_held}</td></tr>
                <tr><td>Orders Cancelled / Voided</td><td>{handoverPreview.orders_voided}</td></tr>
              </tbody>
            </table>
            <form onSubmit={submitHandover}>
              <div className="form-group">
                <label className="form-label">Notes for next shift (optional)</label>
                <textarea className="form-textarea" rows={3} value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  placeholder="e.g. Table 5 still has an open tab, low on cash change..." />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowHandover(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Handover</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {handoverSubmitted && (
        <div className="modal-overlay" onClick={() => setHandoverSubmitted(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div id="x-report-print-area">
              <div className="modal-title">X Report — Shift Handover</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                {new Date().toLocaleString()}
              </div>
              <table className="data-table" style={{ marginBottom: 14 }}>
                <tbody>
                  <tr><td>Orders Completed</td><td>{handoverSubmitted.orders_completed}</td></tr>
                  <tr><td>Total Sales</td><td>{formatMoney(handoverSubmitted.total_sales)}</td></tr>
                  <tr><td>Cash Sales</td><td>{formatMoney(handoverSubmitted.cash_sales)}</td></tr>
                  <tr><td>Transfer Sales</td><td>{formatMoney(handoverSubmitted.transfer_sales)}</td></tr>
                  <tr><td>Orders Held</td><td>{handoverSubmitted.orders_held}</td></tr>
                  <tr><td>Orders Cancelled / Voided</td><td>{handoverSubmitted.orders_voided}</td></tr>
                  {handoverSubmitted.notes && <tr><td>Notes</td><td>{handoverSubmitted.notes}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="modal-actions no-print">
              <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
              <button className="btn btn-primary" onClick={() => setHandoverSubmitted(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showBackdated && (
        <div className="modal-overlay" onClick={() => setShowBackdated(false)}>
          <div className="modal-box" style={{ width: '90vw', maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Past Sale</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Records a completed, paid sale for a date in the past — useful for entering a sale that was missed at the time.
              This still deducts ingredients from inventory for accuracy.
            </div>

            <div className="flex-row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sale Date</label>
                <input className="form-input" type="date" required value={backdatedDate}
                  onChange={(e) => setBackdatedDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Payment Method</label>
                <select className="form-select" value={backdatedMethod} onChange={(e) => setBackdatedMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Waiter (optional)</label>
                <select className="form-select" value={backdatedWaiter} onChange={(e) => setBackdatedWaiter(e.target.value)}>
                  <option value="">—</option>
                  {waiters.map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              </div>
            </div>

            <div className="tabs">
              <button className={'tab-btn' + (backdatedCategory === 'all' ? ' active' : '')} onClick={() => setBackdatedCategory('all')}>All</button>
              {categories.map((c) => (
                <button key={c.id} className={'tab-btn' + (backdatedCategory === c.id ? ' active' : '')} onClick={() => setBackdatedCategory(c.id)}>{c.name}</button>
              ))}
            </div>

            <div className="pos-layout" style={{ height: '50vh' }}>
              <div className="menu-grid">
                {(backdatedCategory === 'all' ? items : items.filter((i) => i.category_id === backdatedCategory)).map((item) => (
                  <button key={item.id} className="menu-tile" onClick={() => addToBackdatedCart(item)}>
                    <div className="menu-tile-name">{item.name}</div>
                    <div className="menu-tile-price">{formatMoney(item.price)}</div>
                    <div className="menu-tile-station">{item.station}</div>
                  </button>
                ))}
              </div>
              <div className="cart-panel">
                <div className="cart-header">Items Sold</div>
                <div className="cart-items">
                  {backdatedCart.length === 0 && <div className="empty-state">Tap items to add them.</div>}
                  {backdatedCart.map((c) => (
                    <div key={c.menu_item_id} className="cart-item">
                      <div>
                        <div>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatMoney(c.price)} each</div>
                      </div>
                      <div className="cart-item-qty">
                        <button className="qty-btn" onClick={() => changeBackdatedQty(c.menu_item_id, -1)}>−</button>
                        <span>{c.qty}</span>
                        <button className="qty-btn" onClick={() => changeBackdatedQty(c.menu_item_id, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-footer">
                  <div className="cart-total-row grand">
                    <span>Total</span>
                    <span>{formatMoney(backdatedCart.reduce((s, c) => s + c.price * c.qty, 0) * 1.15)}</span>
                  </div>
                  <div className="modal-actions" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowBackdated(false)}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={!backdatedCart.length || !backdatedDate} onClick={submitBackdated}>
                      Record Sale
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
