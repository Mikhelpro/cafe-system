import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/sales', requireAuth, requireRole('manager', 'finance'), (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? 'AND date(completed_at) BETWEEN date(?) AND date(?)' : '';
  const params = from && to ? [from, to] : [];
  const rows = db.prepare(`
    SELECT date(completed_at) as day, COUNT(*) as orders, COALESCE(SUM(total),0) as revenue
    FROM orders
    WHERE status = 'completed' ${dateFilter}
    GROUP BY day ORDER BY day
  `).all(...params);
  res.json(rows);
});

router.get('/top-items', requireAuth, requireRole('manager', 'finance', 'fnb'), (req, res) => {
  const rows = db.prepare(`
    SELECT mi.name, mi.price, c.name as category_name, SUM(oi.qty) as qty_sold, SUM(oi.qty * oi.price) as revenue
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN categories c ON c.id = mi.category_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'completed'
    GROUP BY mi.id ORDER BY qty_sold DESC LIMIT 10
  `).all();
  res.json(rows);
});

// F&B: full sales breakdown per item, with price, category, quantity sold, revenue
router.get('/fnb-sales', requireAuth, requireRole('fnb', 'manager', 'finance'), (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? "AND date(o.completed_at) BETWEEN date(?) AND date(?)" : '';
  const params = from && to ? [from, to] : [];
  const rows = db.prepare(`
    SELECT mi.name, mi.price, c.name as category_name,
      COALESCE(SUM(oi.qty), 0) as qty_sold,
      COALESCE(SUM(oi.qty * oi.price), 0) as revenue
    FROM menu_items mi
    LEFT JOIN categories c ON c.id = mi.category_id
    LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
    LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'completed' ${dateFilter}
    GROUP BY mi.id
    ORDER BY qty_sold DESC
  `).all(...params);
  res.json(rows);
});

router.get('/dashboard', requireAuth, requireRole('manager', 'finance'), (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayRevenue = db.prepare(
    "SELECT COALESCE(SUM(total),0) as v FROM orders WHERE status='completed' AND date(completed_at) = date(?)"
  ).get(today).v;
  const todayOrders = db.prepare(
    "SELECT COUNT(*) as v FROM orders WHERE status='completed' AND date(completed_at) = date(?)"
  ).get(today).v;
  const openOrders = db.prepare(
    "SELECT COUNT(*) as v FROM orders WHERE status NOT IN ('completed','cancelled')"
  ).get().v;
  const lowStock = db.prepare(
    'SELECT COUNT(*) as v FROM inventory_items WHERE quantity <= reorder_level'
  ).get().v;
  const activeCustomers = db.prepare('SELECT COUNT(*) as v FROM customers').get().v;
  const occupiedTables = db.prepare(
    "SELECT COUNT(*) as v FROM store_tables WHERE status = 'occupied'"
  ).get().v;
  const totalTables = db.prepare('SELECT COUNT(*) as v FROM store_tables').get().v;

  res.json({ todayRevenue, todayOrders, openOrders, lowStock, activeCustomers, occupiedTables, totalTables });
});

// Owner-only: full activity feed across the whole system
router.get('/activity', requireAuth, requireRole(), (req, res) => {
  const { log_type } = req.query;
  let query = `
    SELECT al.*, u.name as user_name, u.role as user_role
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.user_id
  `;
  const params = [];
  if (log_type) {
    query += ' WHERE al.log_type = ?';
    params.push(log_type);
  }
  query += ' ORDER BY al.created_at DESC LIMIT 300';
  res.json(db.prepare(query).all(...params));
});

// Owner-only: full data export for a date range - orders, expenses, activity, stock movements
router.get('/export', requireAuth, requireRole(), (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? "AND date(created_at) BETWEEN date(?) AND date(?)" : '';
  const params = from && to ? [from, to] : [];

  const orders = db.prepare(`
    SELECT o.*, u.name as created_by_name
    FROM orders o LEFT JOIN users u ON u.id = o.created_by
    WHERE 1=1 ${dateFilter.replace('created_at', 'o.created_at')}
    ORDER BY o.created_at DESC
  `).all(...params);

  const orderItemsStmt = db.prepare(`
    SELECT oi.*, mi.name as item_name FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id WHERE oi.order_id = ?
  `);
  const ordersWithItems = orders.map((o) => ({ ...o, items: orderItemsStmt.all(o.id) }));

  const expenses = db.prepare(`
    SELECT e.*, u.name as created_by_name FROM expenses e
    LEFT JOIN users u ON u.id = e.created_by
    WHERE 1=1 ${dateFilter} ORDER BY e.created_at DESC
  `).all(...params);

  const stockMovements = db.prepare(`
    SELECT sm.*, ii.name as item_name, ii.unit, u.name as user_name
    FROM stock_movements sm
    JOIN inventory_items ii ON ii.id = sm.inventory_item_id
    LEFT JOIN users u ON u.id = sm.created_by
    WHERE 1=1 ${dateFilter} ORDER BY sm.created_at DESC
  `).all(...params);

  const activity = db.prepare(`
    SELECT al.*, u.name as user_name, u.role as user_role
    FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1 ${dateFilter} ORDER BY al.created_at DESC
  `).all(...params);

  const revenue = ordersWithItems.filter((o) => o.status === 'completed').reduce((s, o) => s + o.total, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  res.json({
    generated_at: new Date().toISOString(),
    range: { from: from || null, to: to || null },
    summary: {
      total_orders: ordersWithItems.length,
      completed_orders: ordersWithItems.filter((o) => o.status === 'completed').length,
      cancelled_orders: ordersWithItems.filter((o) => o.status === 'cancelled').length,
      void_orders: ordersWithItems.filter((o) => o.status === 'void').length,
      revenue,
      total_expenses: totalExpenses,
      net: +(revenue - totalExpenses).toFixed(2),
    },
    orders: ordersWithItems,
    expenses,
    stock_movements: stockMovements,
    activity,
  });
});

// Generate and store a Z report (end-of-day closing) — owner/manager only.
// Once generated for a given business_date it is locked in as a permanent record with a unique code.
router.post('/z-report', requireAuth, requireRole('manager'), (req, res) => {
  const businessDate = req.body.business_date || new Date().toISOString().slice(0, 10);

  const orders = db.prepare(`
    SELECT * FROM orders WHERE status = 'completed' AND date(completed_at) = date(?)
  `).all(businessDate);

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);

  const payments = db.prepare(`
    SELECT p.method, SUM(p.amount) as total FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE o.status = 'completed' AND date(o.completed_at) = date(?)
    GROUP BY p.method
  `).all(businessDate);
  const cashSales = payments.find((p) => p.method === 'cash')?.total || 0;
  const transferSales = payments.find((p) => p.method === 'transfer')?.total || 0;

  const items = db.prepare(`
    SELECT mi.name, mi.price, SUM(oi.qty) as qty_sold, SUM(oi.qty * oi.price) as revenue
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'completed' AND date(o.completed_at) = date(?)
    GROUP BY mi.id ORDER BY qty_sold DESC
  `).all(businessDate);

  const reportCode = `Z-${businessDate.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const result = db.prepare(`
    INSERT INTO z_reports
      (report_code, generated_by, business_date, total_orders, total_revenue, cash_sales, transfer_sales, items_json)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    reportCode, req.user.id, businessDate, orders.length, totalRevenue,
    cashSales, transferSales, JSON.stringify(items)
  );

  logActivity(req.user.id, 'z_report_generated', `Z Report ${reportCode} for ${businessDate} — ETB ${totalRevenue.toFixed(2)}, ${orders.length} orders`);

  res.status(201).json({
    id: result.lastInsertRowid,
    report_code: reportCode,
    business_date: businessDate,
    total_orders: orders.length,
    total_revenue: totalRevenue,
    cash_sales: cashSales,
    transfer_sales: transferSales,
    items,
    generated_at: new Date().toISOString(),
  });
});

router.get('/z-report', requireAuth, requireRole('manager'), (req, res) => {
  const rows = db.prepare('SELECT * FROM z_reports ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows.map((r) => ({ ...r, items: JSON.parse(r.items_json) })));
});

router.get('/z-report/:id', requireAuth, requireRole('manager'), (req, res) => {
  const row = db.prepare('SELECT * FROM z_reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Z report not found' });
  res.json({ ...row, items: JSON.parse(row.items_json) });
});

export default router;
