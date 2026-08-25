import { Router } from 'express';
import { db, transaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const { q } = req.query;
  if (q) {
    return res.json(
      db.prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 50')
        .all(`%${q}%`, `%${q}%`)
    );
  }
  res.json(db.prepare('SELECT * FROM customers ORDER BY name LIMIT 200').all());
});

router.post('/', requireAuth, requireRole('cashier'), (req, res) => {
  const { name, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = db.prepare('INSERT INTO customers (name, phone, email) VALUES (?,?,?)')
      .run(name, phone || null, email || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Phone already registered' });
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const transactions = db.prepare(
    'SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json({ ...customer, transactions });
});

// Redeem loyalty points
router.post('/:id/redeem', requireAuth, requireRole('cashier'), (req, res) => {
  const { points } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (!points || points <= 0) return res.status(400).json({ error: 'points must be positive' });
  if (customer.loyalty_points < points) return res.status(400).json({ error: 'Insufficient points' });

  transaction(() => {
    db.prepare('UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?').run(points, req.params.id);
    db.prepare('INSERT INTO loyalty_transactions (customer_id, points, type) VALUES (?,?,?)')
      .run(req.params.id, points, 'redeem');
  });
  res.json({ ok: true });
});

export default router;
