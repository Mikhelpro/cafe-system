import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/shifts', requireAuth, (req, res) => {
  const { from, to, user_id } = req.query;
  let query = `
    SELECT s.*, u.name as user_name, w.name as waiter_name
    FROM shifts s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN waiters w ON w.id = s.waiter_id
  `;
  const clauses = [];
  const params = [];
  if (from) { clauses.push('shift_date >= ?'); params.push(from); }
  if (to) { clauses.push('shift_date <= ?'); params.push(to); }
  if (user_id) { clauses.push('s.user_id = ?'); params.push(user_id); }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY shift_date, start_time';
  res.json(db.prepare(query).all(...params));
});

router.post('/shifts', requireAuth, requireRole('manager'), (req, res) => {
  const { user_id, waiter_id, shift_date, start_time, end_time } = req.body;
  if ((!user_id && !waiter_id) || !shift_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'A staff member or waiter, shift_date, start_time, and end_time are required' });
  }
  const result = db.prepare(
    'INSERT INTO shifts (user_id, waiter_id, shift_date, start_time, end_time) VALUES (?,?,?,?,?)'
  ).run(user_id || null, waiter_id || null, shift_date, start_time, end_time);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/shifts/:id', requireAuth, requireRole('manager'), (req, res) => {
  const { status, start_time, end_time } = req.body;
  if (status) db.prepare('UPDATE shifts SET status = ? WHERE id = ?').run(status, req.params.id);
  if (start_time) db.prepare('UPDATE shifts SET start_time = ? WHERE id = ?').run(start_time, req.params.id);
  if (end_time) db.prepare('UPDATE shifts SET end_time = ? WHERE id = ?').run(end_time, req.params.id);
  res.json({ ok: true });
});

router.delete('/shifts/:id', requireAuth, requireRole('manager'), (req, res) => {
  db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Clock in/out - any authenticated staff member for themselves
router.post('/attendance/clock-in', requireAuth, (req, res) => {
  const { shift_id } = req.body;
  const result = db.prepare(
    "INSERT INTO attendance (user_id, shift_id, clock_in) VALUES (?,?,datetime('now'))"
  ).run(req.user.id, shift_id || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post('/attendance/:id/clock-out', requireAuth, (req, res) => {
  const record = db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });
  if (record.user_id !== req.user.id && req.user.role !== 'owner' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Cannot clock out for another user' });
  }
  db.prepare("UPDATE attendance SET clock_out = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.get('/attendance', requireAuth, requireRole('manager'), (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.name as user_name
    FROM attendance a JOIN users u ON u.id = a.user_id
    ORDER BY a.clock_in DESC LIMIT 200
  `).all();
  res.json(rows);
});

export default router;
