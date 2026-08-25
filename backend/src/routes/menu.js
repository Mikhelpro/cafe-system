import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/categories', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

router.post('/categories', requireAuth, requireRole('manager'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/items', requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT mi.*, c.name as category_name
    FROM menu_items mi LEFT JOIN categories c ON c.id = mi.category_id
    ORDER BY mi.name
  `).all();
  res.json(items);
});

router.post('/items', requireAuth, requireRole('manager'), (req, res) => {
  const { name, category_id, price, cost, station } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'name and price required' });
  const result = db.prepare(
    'INSERT INTO menu_items (name, category_id, price, cost, station) VALUES (?,?,?,?,?)'
  ).run(name, category_id || null, price, cost || 0, station || 'kitchen');
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/items/:id', requireAuth, requireRole('manager'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const fields = ['name', 'category_id', 'price', 'cost', 'station', 'is_active'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      db.prepare(`UPDATE menu_items SET ${f} = ? WHERE id = ?`).run(req.body[f], id);
    }
  }
  res.json({ ok: true });
});

router.delete('/items/:id', requireAuth, requireRole('manager'), (req, res) => {
  db.prepare('UPDATE menu_items SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Recipe (links menu item to inventory items consumed)
router.get('/items/:id/recipe', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT ri.*, ii.name as inventory_name, ii.unit
    FROM recipe_items ri JOIN inventory_items ii ON ii.id = ri.inventory_item_id
    WHERE ri.menu_item_id = ?
  `).all(req.params.id);
  res.json(rows);
});

router.post('/items/:id/recipe', requireAuth, requireRole('manager', 'storekeeper'), (req, res) => {
  const { inventory_item_id, qty_used } = req.body;
  if (!inventory_item_id || !qty_used) return res.status(400).json({ error: 'inventory_item_id and qty_used required' });
  const result = db.prepare(
    'INSERT INTO recipe_items (menu_item_id, inventory_item_id, qty_used) VALUES (?,?,?)'
  ).run(req.params.id, inventory_item_id, qty_used);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/recipe/:recipeId', requireAuth, requireRole('manager', 'storekeeper'), (req, res) => {
  db.prepare('DELETE FROM recipe_items WHERE id = ?').run(req.params.recipeId);
  res.json({ ok: true });
});

export default router;
