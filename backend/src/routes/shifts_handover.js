import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Generate a live snapshot of the current cashier's shift activity (not yet saved)
router.get('/preview', requireAuth, requireRole('cashier'), (req, res) => {
  const userId = req.user.id;
  const since = req.query.since || '1970-01-01';

  const ordersCompleted = db.prepare(`
    SELECT COUNT(*) as c, COALESCE(SUM(total),0) as revenue
    FROM orders WHERE created_by = ? AND status = 'completed' AND completed_at >= ?
  `).get(userId, since);

  const cashSales = db.prepare(`
    SELECT COALESCE(SUM(p.amount),0) as v FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE o.created_by = ? AND p.method = 'cash' AND p.paid_at >= ?
  `).get(userId, since).v;

  const transferSales = db.prepare(`
    SELECT COALESCE(SUM(p.amount),0) as v FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE o.created_by = ? AND p.method = 'transfer' AND p.paid_at >= ?
  `).get(userId, since).v;

  const heldCount = db.prepare(`
    SELECT COUNT(*) as c FROM orders WHERE created_by = ? AND status = 'on_hold' AND created_at >= ?
  `).get(userId, since).c;

  const voidCount = db.prepare(`
    SELECT COUNT(*) as c FROM orders WHERE created_by = ? AND status IN ('void','cancelled') AND created_at >= ?
  `).get(userId, since).c;

  res.json({
    orders_completed: ordersCompleted.c,
    total_sales: ordersCompleted.revenue,
    cash_sales: cashSales,
    transfer_sales: transferSales,
    orders_held: heldCount,
    orders_voided: voidCount,
  });
});

// Submit an end-of-shift handover record
router.post('/', requireAuth, requireRole('cashier'), (req, res) => {
  const { orders_completed, total_sales, cash_sales, transfer_sales, orders_held, orders_voided, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO shift_handovers
      (user_id, orders_completed, total_sales, cash_sales, transfer_sales, orders_held, orders_voided, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    req.user.id,
    orders_completed || 0,
    total_sales || 0,
    cash_sales || 0,
    transfer_sales || 0,
    orders_held || 0,
    orders_voided || 0,
    notes || null
  );
  logActivity(
    req.user.id,
    'shift_handover',
    `${req.user.name} ended shift — ETB ${Number(total_sales || 0).toFixed(2)} sales, ${orders_completed || 0} orders, ${orders_held || 0} held, ${orders_voided || 0} voided`
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

// List handovers (any staff can see their own; manager/owner see all)
router.get('/', requireAuth, (req, res) => {
  let query = `
    SELECT sh.*, u.name as user_name
    FROM shift_handovers sh JOIN users u ON u.id = sh.user_id
  `;
  const params = [];
  if (!['owner', 'manager'].includes(req.user.role)) {
    query += ' WHERE sh.user_id = ?';
    params.push(req.user.id);
  }
  query += ' ORDER BY sh.created_at DESC LIMIT 100';
  res.json(db.prepare(query).all(...params));
});

export default router;
