import { Router } from 'express';
import { db, transaction, logActivity, recordStockMovement, moveStockToKitchen } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Registered early, before any /:id pattern routes, so 'kitchen' in the path
// is never mistaken for an inventory item id.
router.get('/kitchen/stock', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT ks.*, ii.name, ii.unit, ii.cost_per_unit, ii.reorder_level
    FROM kitchen_stock ks JOIN inventory_items ii ON ii.id = ks.inventory_item_id
    ORDER BY ii.name
  `).all();
  res.json(rows);
});

router.get('/kitchen/movements', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT km.*, ii.name as item_name, ii.unit, u.name as user_name
    FROM kitchen_movements km
    JOIN inventory_items ii ON ii.id = km.inventory_item_id
    LEFT JOIN users u ON u.id = km.created_by
    ORDER BY km.created_at DESC
    LIMIT 300
  `).all();
  res.json(rows);
});

router.get('/categories', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory_categories ORDER BY name').all());
});

router.post('/categories', requireAuth, requireRole('manager', 'storekeeper'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = db.prepare('INSERT INTO inventory_categories (name) VALUES (?)').run(name);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.get('/', requireAuth, (req, res) => {
  const { category_id } = req.query;
  let query = `
    SELECT ii.*, ic.name as category_name
    FROM inventory_items ii LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
    WHERE ii.is_active = 1
  `;
  const params = [];
  if (category_id) {
    query += ' AND ii.category_id = ?';
    params.push(category_id);
  }
  query += ' ORDER BY ii.name';
  res.json(db.prepare(query).all(...params));
});

router.get('/low-stock', requireAuth, (req, res) => {
  res.json(
    db.prepare('SELECT * FROM inventory_items WHERE is_active = 1 AND quantity <= reorder_level ORDER BY name').all()
  );
});

router.post('/', requireAuth, requireRole('manager', 'storekeeper'), (req, res) => {
  const { name, category_id, unit, quantity, reorder_level, cost_per_unit, entry_date } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const createdAt = entry_date ? `${entry_date} 00:00:00` : null;
  const result = createdAt
    ? db.prepare(
        'INSERT INTO inventory_items (name, category_id, unit, quantity, reorder_level, cost_per_unit, created_at) VALUES (?,?,?,?,?,?,?)'
      ).run(name, category_id || null, unit || 'unit', quantity || 0, reorder_level || 0, cost_per_unit || 0, createdAt)
    : db.prepare(
        'INSERT INTO inventory_items (name, category_id, unit, quantity, reorder_level, cost_per_unit) VALUES (?,?,?,?,?,?)'
      ).run(name, category_id || null, unit || 'unit', quantity || 0, reorder_level || 0, cost_per_unit || 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Owner-only: remove an item from the store entirely (soft delete — keeps its
// stock/kitchen history intact for reporting, just hides it from active lists)
router.delete('/:id', requireAuth, requireRole(), (req, res) => {
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  db.prepare('UPDATE inventory_items SET is_active = 0 WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, 'inventory_item_deleted', `${item.name} removed from inventory`);
  res.json({ ok: true });
});

router.patch('/:id', requireAuth, requireRole('manager', 'storekeeper'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const fields = ['name', 'category_id', 'unit', 'reorder_level', 'cost_per_unit'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      db.prepare(`UPDATE inventory_items SET ${f} = ? WHERE id = ?`).run(req.body[f], id);
    }
  }
  db.prepare("UPDATE inventory_items SET updated_at = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true });
});

// Stock movement: purchase / waste / adjustment (usage is auto-deducted by orders)
router.post('/:id/movement', requireAuth, requireRole('manager', 'chef', 'storekeeper'), (req, res) => {
  const { change_qty, reason, note } = req.body;
  if (change_qty === undefined || !reason) return res.status(400).json({ error: 'change_qty and reason required' });

  // Only the owner can remove/reduce stock (waste or a downward adjustment).
  // Adding stock (purchase, or an upward adjustment) stays open to manager/chef/storekeeper.
  if (change_qty < 0 && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can remove stock from inventory' });
  }

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  transaction(() => {
    recordStockMovement(req.params.id, change_qty, reason, note, req.user.id);
    db.prepare("UPDATE inventory_items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?")
      .run(change_qty, req.params.id);
  });
  logActivity(req.user.id, 'stock_adjusted', `${item.name}: ${change_qty >= 0 ? '+' : ''}${change_qty} ${item.unit} (${reason})`);
  res.status(201).json({ ok: true });
});

router.get('/movements', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT sm.*, ii.name as item_name, ii.unit, u.name as user_name
    FROM stock_movements sm
    JOIN inventory_items ii ON ii.id = sm.inventory_item_id
    LEFT JOIN users u ON u.id = sm.created_by
    ORDER BY sm.created_at DESC
    LIMIT 300
  `).all();
  res.json(rows);
});

router.get('/:id/movements', requireAuth, (req, res) => {
  res.json(
    db.prepare('SELECT * FROM stock_movements WHERE inventory_item_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(req.params.id)
  );
});

// ===================== KITCHEN INVENTORY =====================

router.post('/:id/move-to-kitchen', requireAuth, requireRole('manager', 'storekeeper'), (req, res) => {
  const { qty, note } = req.body;
  if (!qty || qty <= 0) return res.status(400).json({ error: 'qty must be a positive number' });

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.quantity < qty) {
    return res.status(400).json({ error: `Not enough stock in the store — only ${item.quantity} ${item.unit} available` });
  }

  transaction(() => {
    moveStockToKitchen(req.params.id, qty, note, req.user.id);
  });

  logActivity(req.user.id, 'moved_to_kitchen', `${item.name}: ${qty} ${item.unit} moved to kitchen`);
  res.status(201).json({ ok: true });
});

router.post('/kitchen/:id/movement', requireAuth, requireRole('manager', 'chef', 'storekeeper'), (req, res) => {
  const { change_qty, reason, note } = req.body;
  const validReasons = ['waste', 'adjustment'];
  if (change_qty === undefined || !validReasons.includes(reason)) {
    return res.status(400).json({ error: 'change_qty and a valid reason (waste or adjustment) are required' });
  }
  const row = db.prepare('SELECT * FROM kitchen_stock WHERE inventory_item_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'This item is not currently tracked in the kitchen' });

  const qtyBefore = row.quantity;
  const qtyAfter = qtyBefore + change_qty;
  transaction(() => {
    db.prepare(
      'INSERT INTO kitchen_movements (inventory_item_id, change_qty, qty_before, qty_after, reason, note, created_by) VALUES (?,?,?,?,?,?,?)'
    ).run(req.params.id, change_qty, qtyBefore, qtyAfter, reason, note || null, req.user.id);
    db.prepare("UPDATE kitchen_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE inventory_item_id = ?")
      .run(change_qty, req.params.id);
  });
  res.status(201).json({ ok: true });
});

export default router;
