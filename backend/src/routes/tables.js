import { Router } from 'express';
import { db, transaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/tables', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM store_tables ORDER BY id').all());
});

router.post('/tables', requireAuth, requireRole('manager'), (req, res) => {
  const { name, capacity } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO store_tables (name, capacity) VALUES (?,?)').run(name, capacity || 2);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/tables/:id', requireAuth, requireRole('cashier'), (req, res) => {
  const { status } = req.body;
  const valid = ['free', 'occupied', 'reserved'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE store_tables SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

router.get('/reservations', requireAuth, (req, res) => {
  const { date } = req.query;
  let query = 'SELECT * FROM reservations';
  const params = [];
  if (date) {
    query += " WHERE date(reservation_time) = date(?)";
    params.push(date);
  }
  query += ' ORDER BY reservation_time ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/reservations', requireAuth, requireRole('cashier'), (req, res) => {
  const { table_id, customer_name, phone, party_size, reservation_time, notes } = req.body;
  if (!customer_name || !reservation_time) {
    return res.status(400).json({ error: 'customer_name and reservation_time required' });
  }
  const id = transaction(() => {
    const result = db.prepare(
      'INSERT INTO reservations (table_id, customer_name, phone, party_size, reservation_time, notes) VALUES (?,?,?,?,?,?)'
    ).run(table_id || null, customer_name, phone || null, party_size || 2, reservation_time, notes || null);
    if (table_id) db.prepare("UPDATE store_tables SET status = 'reserved' WHERE id = ?").run(table_id);
    return result.lastInsertRowid;
  });
  res.status(201).json({ id });
});

router.patch('/reservations/:id', requireAuth, requireRole('cashier'), (req, res) => {
  const { status } = req.body;
  const valid = ['booked', 'seated', 'cancelled', 'completed'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const resv = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!resv) return res.status(404).json({ error: 'Reservation not found' });

  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);
  if (resv.table_id) {
    if (status === 'seated') db.prepare("UPDATE store_tables SET status = 'occupied' WHERE id = ?").run(resv.table_id);
    if (status === 'cancelled' || status === 'completed') {
      db.prepare("UPDATE store_tables SET status = 'free' WHERE id = ?").run(resv.table_id);
    }
  }
  res.json({ ok: true });
});

export default router;
