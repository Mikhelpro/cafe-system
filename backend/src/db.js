import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cafe.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const isNew = !fs.existsSync(DB_PATH);

// Uses Node's built-in SQLite module (available Node 22.5+/24+) instead of
// better-sqlite3, so there is nothing to compile — no build tools, no
// prebuilt-binary lookups, works the same on Windows/Mac/Linux out of the box.
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// node:sqlite has no built-in .transaction() helper like better-sqlite3 did,
// so this wraps a block of statements in BEGIN/COMMIT with rollback on error.
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function logActivity(userId, action, details, logType = 'activity') {
  try {
    db.prepare('INSERT INTO activity_log (user_id, action, details, log_type) VALUES (?,?,?,?)')
      .run(userId || null, action, details || null, logType);
  } catch (e) {
    console.error('Failed to log activity:', e.message);
  }
}

export function recordStockMovement(inventoryItemId, changeQty, reason, note, userId) {
  const item = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(inventoryItemId);
  const qtyBefore = item ? item.quantity : 0;
  const qtyAfter = qtyBefore + changeQty;
  db.prepare(
    'INSERT INTO stock_movements (inventory_item_id, change_qty, qty_before, qty_after, reason, note, created_by) VALUES (?,?,?,?,?,?,?)'
  ).run(inventoryItemId, changeQty, qtyBefore, qtyAfter, reason, note || null, userId || null);
}

function recordKitchenMovement(inventoryItemId, changeQty, reason, note, userId) {
  const row = db.prepare('SELECT quantity FROM kitchen_stock WHERE inventory_item_id = ?').get(inventoryItemId);
  const qtyBefore = row ? row.quantity : 0;
  const qtyAfter = qtyBefore + changeQty;
  db.prepare(
    'INSERT INTO kitchen_movements (inventory_item_id, change_qty, qty_before, qty_after, reason, note, created_by) VALUES (?,?,?,?,?,?,?)'
  ).run(inventoryItemId, changeQty, qtyBefore, qtyAfter, reason, note || null, userId || null);
}

// Move stock from the main store into the kitchen. Decreases the store quantity
// and increases (or creates) the kitchen quantity for that item, logging both sides.
export function moveStockToKitchen(inventoryItemId, qty, note, userId) {
  recordStockMovement(inventoryItemId, -qty, 'transfer_out', note, userId);
  db.prepare('UPDATE inventory_items SET quantity = quantity - ? WHERE id = ?').run(qty, inventoryItemId);

  const existing = db.prepare('SELECT * FROM kitchen_stock WHERE inventory_item_id = ?').get(inventoryItemId);
  if (!existing) {
    db.prepare('INSERT INTO kitchen_stock (inventory_item_id, quantity) VALUES (?, 0)').run(inventoryItemId);
  }
  recordKitchenMovement(inventoryItemId, qty, 'transfer_in', note, userId);
  db.prepare("UPDATE kitchen_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE inventory_item_id = ?")
    .run(qty, inventoryItemId);
}

// Used when a sale consumes an ingredient (deltaQty negative) or an order is
// cancelled/voided/edited and stock needs restoring (deltaQty positive).
// If the ingredient has ever been moved into the kitchen, it's deducted/restored
// from kitchen stock (that's physically where it gets used); otherwise it comes
// straight out of the main store, same as before kitchen tracking existed.
export function adjustStockForSale(inventoryItemId, deltaQty, note, userId) {
  const kitchenRow = db.prepare('SELECT * FROM kitchen_stock WHERE inventory_item_id = ?').get(inventoryItemId);
  const reason = deltaQty < 0 ? 'usage' : 'adjustment';
  if (kitchenRow) {
    recordKitchenMovement(inventoryItemId, deltaQty, reason, note, userId);
    db.prepare("UPDATE kitchen_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE inventory_item_id = ?")
      .run(deltaQty, inventoryItemId);
  } else {
    recordStockMovement(inventoryItemId, deltaQty, reason, note, userId);
    db.prepare('UPDATE inventory_items SET quantity = quantity + ? WHERE id = ?').run(deltaQty, inventoryItemId);
  }
}

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// ===================== SAFE AUTO-MIGRATION =====================
// schema.sql only CREATEs tables that don't exist yet — it can't add new
// columns to a table that's already there. Whenever a feature adds a column
// to an existing table, list it here so upgrading to a newer version of the
// app never requires deleting the database to pick up the change.
const columnMigrations = [
  { table: 'users', column: 'current_password', ddl: 'ALTER TABLE users ADD COLUMN current_password TEXT' },
  { table: 'orders', column: 'waiter_name', ddl: 'ALTER TABLE orders ADD COLUMN waiter_name TEXT' },
  { table: 'orders', column: 'held_by', ddl: 'ALTER TABLE orders ADD COLUMN held_by INTEGER REFERENCES users(id)' },
  { table: 'orders', column: 'void_reason', ddl: 'ALTER TABLE orders ADD COLUMN void_reason TEXT' },
  { table: 'stock_movements', column: 'qty_before', ddl: 'ALTER TABLE stock_movements ADD COLUMN qty_before REAL NOT NULL DEFAULT 0' },
  { table: 'stock_movements', column: 'qty_after', ddl: 'ALTER TABLE stock_movements ADD COLUMN qty_after REAL NOT NULL DEFAULT 0' },
  { table: 'activity_log', column: 'log_type', ddl: "ALTER TABLE activity_log ADD COLUMN log_type TEXT NOT NULL DEFAULT 'activity'" },
  { table: 'inventory_items', column: 'created_at', ddl: "ALTER TABLE inventory_items ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))" },
  { table: 'shifts', column: 'waiter_id', ddl: 'ALTER TABLE shifts ADD COLUMN waiter_id INTEGER REFERENCES waiters(id)' },
  { table: 'inventory_items', column: 'is_active', ddl: 'ALTER TABLE inventory_items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1' },
];

for (const { table, column, ddl } of columnMigrations) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const hasColumn = cols.some((c) => c.name === column);
    if (cols.length > 0 && !hasColumn) {
      db.exec(ddl);
      console.log(`Migrated: added ${table}.${column}`);
    }
  } catch (e) {
    console.error(`Migration check failed for ${table}.${column}:`, e.message);
  }
}

// Seed initial data only once
if (isNew) {
  const seedUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, current_password, role) VALUES (?,?,?,?,?)`
  );
  const hash = (p) => bcrypt.hashSync(p, 10);
  seedUser.run('Owner Admin', 'owner@cafe.com', hash('Owner@2026'), 'Owner@2026', 'owner');
  seedUser.run('Manager Mike', 'manager@cafe.com', hash('Manager@2026'), 'Manager@2026', 'manager');
  seedUser.run('Cashier Cara', 'cashier@cafe.com', hash('Cashier@2026'), 'Cashier@2026', 'cashier');
  seedUser.run('Finance Fay', 'finance@cafe.com', hash('Finance@2026'), 'Finance@2026', 'finance');
  seedUser.run('Chef Charlie', 'chef@cafe.com', hash('Chef@2026'), 'Chef@2026', 'chef');
  seedUser.run('Storekeeper Sam', 'storekeeper@cafe.com', hash('Storekeeper@2026'), 'Storekeeper@2026', 'storekeeper');
  seedUser.run('F&B Fiona', 'fnb@cafe.com', hash('Fnb@2026'), 'Fnb@2026', 'fnb');

  const cat = db.prepare(`INSERT INTO categories (name) VALUES (?)`);
  const catHotDrinks = cat.run('Hot Drinks').lastInsertRowid;
  const catMojitos = cat.run('Mojitos').lastInsertRowid;
  const catIcedDrinks = cat.run('Iced Drinks').lastInsertRowid;
  const catWater = cat.run('Water').lastInsertRowid;
  const catSoftDrinks = cat.run('Soft Drinks').lastInsertRowid;
  const catBeer = cat.run('Beer').lastInsertRowid;
  const catSandwiches = cat.run('Sandwiches').lastInsertRowid;
  const catSalads = cat.run('Salads').lastInsertRowid;
  const catFish = cat.run('Fish').lastInsertRowid;
  const catBreakfast = cat.run('Breakfast').lastInsertRowid;
  const catPizza = cat.run('Pizza').lastInsertRowid;
  const catBurgers = cat.run('Burgers').lastInsertRowid;
  const catSnacks = cat.run('Snacks').lastInsertRowid;

  const item = db.prepare(
    `INSERT INTO menu_items (name, category_id, price, cost, station) VALUES (?,?,?,?,?)`
  );

  // Hot Drinks (station: bar)
  item.run('Espresso', catHotDrinks, 150, 0, 'bar');
  item.run('Macchiato', catHotDrinks, 160, 0, 'bar');
  item.run('Double Macchiato', catHotDrinks, 290, 0, 'bar');
  item.run('Fasting Macchiato', catHotDrinks, 190, 0, 'bar');
  item.run('Americano', catHotDrinks, 140, 0, 'bar');
  item.run('Café Latte', catHotDrinks, 250, 0, 'bar');
  item.run('Cappuccino', catHotDrinks, 290, 0, 'bar');
  item.run('Hot Chocolate', catHotDrinks, 290, 0, 'bar');
  item.run('Caramel Macchiato', catHotDrinks, 290, 0, 'bar');
  item.run('Ginger Tea', catHotDrinks, 80, 0, 'bar');
  item.run('Peanut with Coffee', catHotDrinks, 170, 0, 'bar');
  item.run('Coffee', catHotDrinks, 150, 0, 'bar');
  item.run('Special Tea', catHotDrinks, 220, 0, 'bar');
  item.run('Peanut Tea', catHotDrinks, 120, 0, 'bar');
  item.run('Green Tea', catHotDrinks, 90, 0, 'bar');

  // Mojitos (station: bar)
  item.run('Classic Mint Mojito', catMojitos, 230, 0, 'bar');
  item.run('Strawberry Mojito', catMojitos, 220, 0, 'bar');
  item.run('Lemon Mojito', catMojitos, 220, 0, 'bar');
  item.run('Pineapple Mojito', catMojitos, 220, 0, 'bar');

  // Iced Drinks (station: bar)
  item.run('Iced Americano', catIcedDrinks, 140, 0, 'bar');
  item.run('Iced Latte', catIcedDrinks, 250, 0, 'bar');
  item.run('Iced Caramel Latte', catIcedDrinks, 290, 0, 'bar');
  item.run('Iced Mocha', catIcedDrinks, 290, 0, 'bar');
  item.run('Iced Chocolate Latte', catIcedDrinks, 290, 0, 'bar');
  item.run('Ice Tea', catIcedDrinks, 110, 0, 'bar');

  // Water (station: bar)
  item.run('Water (0.5L)', catWater, 50, 0, 'bar');
  item.run('Water (1L)', catWater, 70, 0, 'bar');
  item.run('Ambo Water', catWater, 110, 0, 'bar');

  // Soft Drinks (station: bar)
  item.run('Coca-Cola', catSoftDrinks, 100, 0, 'bar');
  item.run('Coca-Cola Zero', catSoftDrinks, 100, 0, 'bar');
  item.run('Fanta Orange', catSoftDrinks, 100, 0, 'bar');
  item.run('Fanta Pineapple', catSoftDrinks, 100, 0, 'bar');
  item.run('Sprise', catSoftDrinks, 100, 0, 'bar');
  item.run('Pepsi', catSoftDrinks, 100, 0, 'bar');
  item.run('Mirinda', catSoftDrinks, 100, 0, 'bar');

  // Beer (station: bar)
  item.run('Beer', catBeer, 120, 0, 'bar');
  item.run('Heineken', catBeer, 160, 0, 'bar');
  item.run('Arada', catBeer, 160, 0, 'bar');

  // Sandwiches (station: kitchen)
  item.run('Fish Sandwich', catSandwiches, 650, 0, 'kitchen');
  item.run('Chicken Club Sandwich', catSandwiches, 780, 0, 'kitchen');
  item.run('Fish Club Sandwich', catSandwiches, 750, 0, 'kitchen');
  item.run('Vegetable Fasting Sandwich', catSandwiches, 500, 0, 'kitchen');

  // Salads (station: kitchen)
  item.run('Piassa Garden Salad', catSalads, 600, 0, 'kitchen');
  item.run('Grilled Tilapia Salad', catSalads, 700, 0, 'kitchen');
  item.run('Fresh Mixed Salad', catSalads, 500, 0, 'kitchen');

  // Fish (station: kitchen)
  item.run('Big Size Whole Fish', catFish, 1900, 0, 'kitchen');
  item.run('Whole Fish (2 pcs)', catFish, 1400, 0, 'kitchen');
  item.run('Fish Combo', catFish, 1500, 0, 'kitchen');
  item.run('Whole Fish with Tilapia Fish Cutlet', catFish, 1300, 0, 'kitchen');
  item.run('Fish Cutlet', catFish, 800, 0, 'kitchen');
  item.run('Whole Fish & Tilapia Fish', catFish, 1400, 0, 'kitchen');
  item.run('Fish Goulash', catFish, 1200, 0, 'kitchen');

  // Breakfast (station: kitchen)
  item.run('Tibs Firfir', catBreakfast, 800, 0, 'kitchen');
  item.run('Tibs', catBreakfast, 1050, 0, 'kitchen');
  item.run('Asa Dullet', catBreakfast, 560, 0, 'kitchen');
  item.run('Asa Leblab', catBreakfast, 600, 0, 'kitchen');
  item.run('Breakfast Combo', catBreakfast, 950, 0, 'kitchen');
  item.run('Scrambled Eggs', catBreakfast, 400, 0, 'kitchen');
  item.run('Egg Sandwich', catBreakfast, 400, 0, 'kitchen');
  item.run('Cheese Omelette', catBreakfast, 500, 0, 'kitchen');

  // Pizza (station: kitchen)
  item.run('Margherita Pizza', catPizza, 850, 0, 'kitchen');
  item.run('Beef Pizza', catPizza, 1100, 0, 'kitchen');
  item.run('Chicken Pizza', catPizza, 1200, 0, 'kitchen');
  item.run('Piassa Plate Special Pizza', catPizza, 1450, 0, 'kitchen');
  item.run('Fish Pizza', catPizza, 990, 0, 'kitchen');
  item.run('Vegetable Pizza', catPizza, 650, 0, 'kitchen');

  // Burgers (station: kitchen)
  item.run('Fish Burger', catBurgers, 850, 0, 'kitchen');
  item.run('Chicken Burger', catBurgers, 1000, 0, 'kitchen');
  item.run('Beef Burger', catBurgers, 880, 0, 'kitchen');
  item.run('Piassa Plate Special Burger', catBurgers, 1200, 0, 'kitchen');
  item.run('Cheese Burger', catBurgers, 950, 0, 'kitchen');

  // Snacks (station: kitchen)
  item.run('French Fries', catSnacks, 400, 0, 'kitchen');

  const tbl = db.prepare(`INSERT INTO store_tables (name, capacity) VALUES (?,?)`);
  for (let i = 1; i <= 31; i++) tbl.run(`Table ${i}`, i % 2 === 0 ? 4 : 2);

  console.log('Database seeded with demo data.');
  console.log('Demo logins (unique password per role):');
  console.log(' owner@cafe.com / Owner@2026');
  console.log(' manager@cafe.com / Manager@2026');
  console.log(' cashier@cafe.com / Cashier@2026');
  console.log(' finance@cafe.com / Finance@2026');
  console.log(' chef@cafe.com / Chef@2026');
  console.log(' storekeeper@cafe.com / Storekeeper@2026');
  console.log(' fnb@cafe.com / Fnb@2026');
  console.log('Inventory starts empty — add your own categories and stock items from the Inventory page.');
}
