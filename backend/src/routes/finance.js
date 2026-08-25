import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/expenses', requireAuth, requireRole('finance', 'manager'), (req, res) => {
  const { from, to } = req.query;
  let query = 'SELECT * FROM expenses';
  const clauses = [];
  const params = [];
  if (from) { clauses.push('date(created_at) >= date(?)'); params.push(from); }
  if (to) { clauses.push('date(created_at) <= date(?)'); params.push(to); }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/expenses', requireAuth, requireRole('finance', 'manager'), (req, res) => {
  const { category, amount, description } = req.body;
  if (!category || !amount) return res.status(400).json({ error: 'category and amount required' });
  const result = db.prepare(
    'INSERT INTO expenses (category, amount, description, created_by) VALUES (?,?,?,?)'
  ).run(category, amount, description || null, req.user.id);
  logActivity(req.user.id, 'expense_added', `${category} — ETB ${Number(amount).toFixed(2)}`);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/expenses/:id', requireAuth, requireRole('finance', 'manager'), (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Profit & loss summary
router.get('/summary', requireAuth, requireRole('finance', 'manager'), (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? "AND date(created_at) BETWEEN date(?) AND date(?)" : '';
  const params = from && to ? [from, to] : [];

  const revenue = db.prepare(
    `SELECT COALESCE(SUM(total),0) as revenue FROM orders WHERE status = 'completed' ${dateFilter.replace('created_at', 'completed_at')}`
  ).get(...params).revenue;

  const expenses = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE 1=1 ${dateFilter}`
  ).get(...params).total;

  const cogs = db.prepare(`
    SELECT COALESCE(SUM(oi.qty * mi.cost),0) as cogs
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'completed' ${dateFilter.replace('created_at', 'o.completed_at')}
  `).get(...params).cogs;

  res.json({
    revenue,
    cogs,
    expenses,
    gross_profit: +(revenue - cogs).toFixed(2),
    net_profit: +(revenue - cogs - expenses).toFixed(2)
  });
});

export default router;
