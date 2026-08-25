import { Router } from 'express';
import { db, transaction, logActivity, adjustStockForSale } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

function recalcOrderTotals(orderId) {
  const items = db.prepare(
    "SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'"
  ).all(orderId);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const tax = +(subtotal * 0.15).toFixed(2); // 15% VAT
  const total = +(subtotal - (order.discount || 0) + tax).toFixed(2);
  db.prepare('UPDATE orders SET subtotal = ?, tax = ?, total = ? WHERE id = ?')
    .run(subtotal, tax, total, orderId);
  return { subtotal, tax, total };
}

// List orders (filterable by status)
router.get('/', requireAuth, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM orders';
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY created_at DESC LIMIT 200';
  const orders = db.prepare(query).all(...params);
  const itemsStmt = db.prepare(`
    SELECT oi.*, mi.name as item_name
    FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = ? AND oi.status != 'cancelled'
  `);
  const withItems = orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) }));
  res.json(withItems);
});

router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare(`
    SELECT oi.*, mi.name as item_name
    FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = ?
  `).all(req.params.id);
  const payments = db.prepare('SELECT * FROM payments WHERE order_id = ?').all(req.params.id);
  res.json({ ...order, items, payments });
});

// Kitchen/bar display: pending items grouped by station
router.get('/kitchen/queue', requireAuth, requireRole('chef', 'cashier'), (req, res) => {
  const station = req.query.station; // 'kitchen' or 'bar'
  let query = `
    SELECT oi.*, mi.name as item_name, o.table_id, o.order_type, o.created_at as order_time
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.status IN ('pending','preparing') AND o.status NOT IN ('cancelled','completed')
  `;
  const params = [];
  if (station) {
    query += ' AND oi.station = ?';
    params.push(station);
  }
  query += ' ORDER BY o.created_at ASC';
  res.json(db.prepare(query).all(...params));
});

// Create new order
router.post('/', requireAuth, requireRole('cashier'), (req, res) => {
  const { table_id, customer_id, order_type, items, waiter_name } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'At least one item required' });
  if (!table_id) return res.status(400).json({ error: 'Table is required' });
  if (!waiter_name || !waiter_name.trim()) return res.status(400).json({ error: 'Waiter name is required' });

  const existingActive = db.prepare(`
    SELECT id, waiter_name, status FROM orders
    WHERE table_id = ? AND status NOT IN ('completed', 'cancelled', 'void')
  `).get(table_id);
  if (existingActive) {
    return res.status(409).json({
      error: `This table already has an active order (#${existingActive.id}, waiter: ${existingActive.waiter_name || '—'}). Use "Add Item" on that order instead of starting a new one.`,
      existing_order_id: existingActive.id,
    });
  }

  try {
    const itemSummaries = [];
    const orderId = transaction(() => {
      const orderResult = db.prepare(
        'INSERT INTO orders (table_id, customer_id, order_type, created_by, waiter_name) VALUES (?,?,?,?,?)'
      ).run(table_id, customer_id || null, order_type || 'dine_in', req.user.id, waiter_name.trim());
      const orderId = orderResult.lastInsertRowid;

      for (const it of items) {
        const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(it.menu_item_id);
        if (!menuItem) throw new Error(`Menu item ${it.menu_item_id} not found`);
        db.prepare(
          'INSERT INTO order_items (order_id, menu_item_id, qty, price, station, notes) VALUES (?,?,?,?,?,?)'
        ).run(orderId, it.menu_item_id, it.qty || 1, menuItem.price, menuItem.station, it.notes || null);
        itemSummaries.push(`${it.qty || 1}× ${menuItem.name}`);

        const recipeRows = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(it.menu_item_id);
        for (const r of recipeRows) {
          const deduction = r.qty_used * (it.qty || 1);
          adjustStockForSale(r.inventory_item_id, -deduction, `Order #${orderId}`, req.user.id);
        }
      }

      if (table_id) db.prepare("UPDATE store_tables SET status = 'occupied' WHERE id = ?").run(table_id);

      recalcOrderTotals(orderId);
      return orderId;
    });
    logActivity(req.user.id, 'order_created', `Order #${orderId} — ${itemSummaries.join(', ')}`);
    res.status(201).json({ id: orderId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Add item to existing order
router.post('/:id/items', requireAuth, requireRole('cashier'), (req, res) => {
  const { menu_item_id, qty, notes } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menu_item_id);
  if (!menuItem) return res.status(404).json({ error: 'Menu item not found' });

  transaction(() => {
    db.prepare(
      'INSERT INTO order_items (order_id, menu_item_id, qty, price, station, notes) VALUES (?,?,?,?,?,?)'
    ).run(req.params.id, menu_item_id, qty || 1, menuItem.price, menuItem.station, notes || null);

    const recipeRows = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(menu_item_id);
    for (const r of recipeRows) {
      const deduction = r.qty_used * (qty || 1);
      adjustStockForSale(r.inventory_item_id, -deduction, `Order #${req.params.id}`, req.user.id);
    }
    recalcOrderTotals(req.params.id);
  });
  res.status(201).json({ ok: true });
});

// Update item status (chef marks preparing/ready/served)
router.patch('/items/:itemId/status', requireAuth, requireRole('chef', 'cashier'), (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE order_items SET status = ? WHERE id = ?').run(status, req.params.itemId);
  res.json({ ok: true });
});

// Edit quantity of an item on an unfinished order — reconciles inventory for the difference
router.patch('/items/:itemId/qty', requireAuth, requireRole('cashier'), (req, res) => {
  const { qty } = req.body;
  if (!qty || qty < 1) return res.status(400).json({ error: 'qty must be at least 1' });

  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Order item not found' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id);
  if (['completed', 'cancelled', 'void'].includes(order.status)) {
    return res.status(400).json({ error: 'Cannot edit items on a finished order' });
  }

  const diff = qty - item.qty; // positive = need more stock deducted, negative = restore stock
  transaction(() => {
    db.prepare('UPDATE order_items SET qty = ? WHERE id = ?').run(qty, req.params.itemId);
    if (diff !== 0) {
      const recipeRows = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(item.menu_item_id);
      for (const r of recipeRows) {
        const change = r.qty_used * diff;
        adjustStockForSale(r.inventory_item_id, -change, `Qty edit on Order #${item.order_id}`, req.user.id);
      }
    }
    recalcOrderTotals(item.order_id);
  });
  logActivity(req.user.id, 'order_item_edited', `Order #${item.order_id}: quantity changed to ${qty}`);
  res.json({ ok: true });
});

// Remove an item entirely from an unfinished order — restores any deducted inventory
router.delete('/items/:itemId', requireAuth, requireRole('cashier'), (req, res) => {
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Order item not found' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id);
  if (['completed', 'cancelled', 'void'].includes(order.status)) {
    return res.status(400).json({ error: 'Cannot remove items from a finished order' });
  }
  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.menu_item_id);

  transaction(() => {
    const recipeRows = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(item.menu_item_id);
    for (const r of recipeRows) {
      const restore = r.qty_used * item.qty;
      adjustStockForSale(r.inventory_item_id, restore, `Item removed from Order #${item.order_id}`, req.user.id);
    }
    db.prepare('DELETE FROM order_items WHERE id = ?').run(req.params.itemId);
    recalcOrderTotals(item.order_id);
  });
  logActivity(req.user.id, 'order_item_removed', `Order #${item.order_id}: removed ${item.qty}× ${menuItem?.name || 'item'}`);
  res.json({ ok: true });
});

// Update order status
router.patch('/:id/status', requireAuth, requireRole('cashier', 'chef'), (req, res) => {
  const { status } = req.body;
  const valid = ['open', 'preparing', 'ready', 'served', 'on_hold', 'completed', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (status === 'cancelled' && order.status !== 'cancelled') {
    const items = db.prepare(`
      SELECT oi.*, mi.name as item_name FROM order_items oi
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE oi.order_id = ? AND oi.status != 'cancelled'
    `).all(req.params.id);

    transaction(() => {
      for (const it of items) {
        const recipeRows = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(it.menu_item_id);
        for (const r of recipeRows) {
          const restore = r.qty_used * it.qty;
          adjustStockForSale(r.inventory_item_id, restore, `Cancelled Order #${req.params.id}`, req.user.id);
        }
      }
      db.prepare("UPDATE orders SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?").run(req.params.id);
      if (order.table_id) db.prepare("UPDATE store_tables SET status = 'free' WHERE id = ?").run(order.table_id);
    });

    const itemSummary = items.length ? items.map((i) => `${i.qty}× ${i.item_name}`).join(', ') : 'no items';
    logActivity(req.user.id, 'order_cancelled', `Order #${req.params.id} cancelled — ${itemSummary}`);
    return res.json({ ok: true });
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (status === 'completed') {
    db.prepare("UPDATE orders SET completed_at = datetime('now') WHERE id = ?").run(req.params.id);
    if (order.table_id) db.prepare("UPDATE store_tables SET status = 'free' WHERE id = ?").run(order.table_id);
  }
  res.json({ ok: true });
});

// Checkout: apply discount, take payment, award loyalty points
router.post('/:id/checkout', requireAuth, requireRole('cashier'), (req, res) => {
  const { discount, method, amount_paid } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'completed') return res.status(400).json({ error: 'Order already completed' });

  const totals = transaction(() => {
    if (discount) db.prepare('UPDATE orders SET discount = ? WHERE id = ?').run(discount, req.params.id);
    const totals = recalcOrderTotals(req.params.id);

    db.prepare('INSERT INTO payments (order_id, amount, method, received_by) VALUES (?,?,?,?)')
      .run(req.params.id, amount_paid ?? totals.total, method || 'cash', req.user.id);

    db.prepare("UPDATE orders SET status = 'completed', completed_at = datetime('now') WHERE id = ?")
      .run(req.params.id);

    if (order.table_id) db.prepare("UPDATE store_tables SET status = 'free' WHERE id = ?").run(order.table_id);

    if (order.customer_id) {
      const pointsEarned = Math.floor(totals.total);
      db.prepare('UPDATE customers SET loyalty_points = loyalty_points + ?, total_spent = total_spent + ? WHERE id = ?')
        .run(pointsEarned, totals.total, order.customer_id);
      db.prepare('INSERT INTO loyalty_transactions (customer_id, points, type, order_id) VALUES (?,?,?,?)')
        .run(order.customer_id, pointsEarned, 'earn', req.params.id);
    }
    return totals;
  });

  logActivity(req.user.id, 'order_checkout', `Order #${req.params.id} — ETB ${totals.total.toFixed(2)} via ${method || 'cash'}`);
  const soldItems = db.prepare(`
    SELECT oi.qty, mi.name FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = ? AND oi.status != 'cancelled'
  `).all(req.params.id);
  if (soldItems.length) {
    logActivity(req.user.id, 'items_sold', `Order #${req.params.id}: ${soldItems.map((i) => `${i.qty}× ${i.name}`).join(', ')}`);
  }
  res.json({ ok: true, totals });
});

// Put an unpaid order on hold (e.g. shift change) so another cashier can pick it up later
router.post('/:id/hold', requireAuth, requireRole('cashier'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['completed', 'cancelled', 'void'].includes(order.status)) {
    return res.status(400).json({ error: 'Cannot hold a finished order' });
  }
  db.prepare("UPDATE orders SET status = 'on_hold', held_by = ? WHERE id = ?").run(req.user.id, req.params.id);
  logActivity(req.user.id, 'order_held', `Order #${req.params.id} put on hold`);
  res.json({ ok: true });
});

// Transfer a held (or any unpaid) order to another cashier, e.g. at shift handover
router.post('/:id/transfer', requireAuth, requireRole('cashier'), (req, res) => {
  const { to_user_id } = req.body;
  if (!to_user_id) return res.status(400).json({ error: 'to_user_id required' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['completed', 'cancelled', 'void'].includes(order.status)) {
    return res.status(400).json({ error: 'Cannot transfer a finished order' });
  }
  const toUser = db.prepare('SELECT * FROM users WHERE id = ?').get(to_user_id);
  if (!toUser) return res.status(404).json({ error: 'Target user not found' });

  db.prepare("UPDATE orders SET held_by = ?, status = 'on_hold' WHERE id = ?").run(to_user_id, req.params.id);
  logActivity(req.user.id, 'order_transferred', `Order #${req.params.id} transferred to ${toUser.name}`);
  res.json({ ok: true });
});

// Resume a held order back into active status for the current cashier
router.post('/:id/resume', requireAuth, requireRole('cashier'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.prepare("UPDATE orders SET status = 'open', held_by = NULL WHERE id = ?").run(req.params.id);
  logActivity(req.user.id, 'order_resumed', `Order #${req.params.id} resumed by ${req.user.name}`);
  res.json({ ok: true });
});

// Void an order — reverses any inventory already deducted, frees the table, cannot be undone
router.post('/:id/void', requireAuth, requireRole('cashier', 'manager'), (req, res) => {
  const { reason } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'completed') return res.status(400).json({ error: 'Cannot void a completed order — use a refund process instead' });
  if (order.status === 'void') return res.status(400).json({ error: 'Order is already void' });

  transaction(() => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'").all(req.params.id);
    for (const it of items) {
      const recipeRows = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(it.menu_item_id);
      for (const r of recipeRows) {
        const restore = r.qty_used * it.qty;
        adjustStockForSale(r.inventory_item_id, restore, `Void of Order #${req.params.id}`, req.user.id);
      }
    }
    db.prepare("UPDATE orders SET status = 'void', void_reason = ? WHERE id = ?").run(reason || null, req.params.id);
    if (order.table_id) db.prepare("UPDATE store_tables SET status = 'free' WHERE id = ?").run(order.table_id);
  });

  logActivity(req.user.id, 'order_voided', `Order #${req.params.id}${reason ? ' — ' + reason : ''}`);
  res.json({ ok: true });
});

// Owner-only: record a completed sale for a past date (e.g. one that was missed
// or never entered at the time). Creates the order already completed/paid,
// backdated to the given date, and still deducts inventory for accuracy.
router.post('/backdated', requireAuth, requireRole(), (req, res) => {
  const { sale_date, items, method, waiter_name, notes } = req.body;
  if (!sale_date) return res.status(400).json({ error: 'sale_date is required' });
  if (!items || !items.length) return res.status(400).json({ error: 'At least one item required' });

  const saleDateTime = `${sale_date} 12:00:00`;

  try {
    const orderId = transaction(() => {
      const orderResult = db.prepare(
        "INSERT INTO orders (order_type, created_by, waiter_name, status, created_at, completed_at) VALUES (?,?,?,?,?,?)"
      ).run('dine_in', req.user.id, waiter_name || 'Backdated Entry', 'completed', saleDateTime, saleDateTime);
      const orderId = orderResult.lastInsertRowid;

      for (const it of items) {
        const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(it.menu_item_id);
        if (!menuItem) throw new Error(`Menu item ${it.menu_item_id} not found`);
        db.prepare(
          'INSERT INTO order_items (order_id, menu_item_id, qty, price, station, notes, status) VALUES (?,?,?,?,?,?,?)'
        ).run(orderId, it.menu_item_id, it.qty || 1, menuItem.price, menuItem.station, notes || null, 'served');

        const recipeRows = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(it.menu_item_id);
        for (const r of recipeRows) {
          const deduction = r.qty_used * (it.qty || 1);
          adjustStockForSale(r.inventory_item_id, -deduction, `Backdated sale for ${sale_date} (Order #${orderId})`, req.user.id);
        }
      }

      const totals = recalcOrderTotals(orderId);
      db.prepare('INSERT INTO payments (order_id, amount, method, received_by, paid_at) VALUES (?,?,?,?,?)')
        .run(orderId, totals.total, method || 'cash', req.user.id, saleDateTime);

      return orderId;
    });

    logActivity(req.user.id, 'backdated_sale_added', `Sale for ${sale_date} recorded as Order #${orderId}`);
    res.status(201).json({ id: orderId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
