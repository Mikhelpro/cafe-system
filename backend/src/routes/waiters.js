import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM waiters WHERE active = 1 ORDER BY name').all());
});

router.post('/', requireAuth, requireRole('manager'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO waiters (name) VALUES (?)').run(name.trim());
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:id', requireAuth, requireRole('manager'), (req, res) => {
  const { name, active } = req.body;
  if (name !== undefined) db.prepare('UPDATE waiters SET name = ? WHERE id = ?').run(name, req.params.id);
  if (active !== undefined) db.prepare('UPDATE waiters SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireRole('manager'), (req, res) => {
  db.prepare('UPDATE waiters SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
