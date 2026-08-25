-- ===================== USERS & AUTH =====================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  current_password TEXT,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','cashier','finance','chef','storekeeper','fnb')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== MENU =====================
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  price REAL NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  station TEXT NOT NULL DEFAULT 'kitchen' CHECK(station IN ('kitchen','bar')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== INVENTORY =====================
CREATE TABLE IF NOT EXISTS inventory_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES inventory_categories(id),
  unit TEXT NOT NULL DEFAULT 'unit',
  quantity REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  cost_per_unit REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  qty_used REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  change_qty REAL NOT NULL,
  qty_before REAL NOT NULL DEFAULT 0,
  qty_after REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK(reason IN ('purchase','usage','waste','adjustment','transfer_out')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== TABLES & RESERVATIONS =====================
CREATE TABLE IF NOT EXISTS store_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free','occupied','reserved'))
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER REFERENCES store_tables(id),
  customer_name TEXT NOT NULL,
  phone TEXT,
  party_size INTEGER NOT NULL DEFAULT 2,
  reservation_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','seated','cancelled','completed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== CUSTOMERS & LOYALTY =====================
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  loyalty_points REAL NOT NULL DEFAULT 0,
  total_spent REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  points REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('earn','redeem')),
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== ORDERS (POS) =====================
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER REFERENCES store_tables(id),
  customer_id INTEGER REFERENCES customers(id),
  order_type TEXT NOT NULL DEFAULT 'dine_in' CHECK(order_type IN ('dine_in','takeaway','delivery')),
  waiter_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','preparing','ready','served','on_hold','completed','cancelled','void')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  held_by INTEGER REFERENCES users(id),
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  qty INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL,
  station TEXT NOT NULL DEFAULT 'kitchen',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','served','cancelled')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount REAL NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('cash','transfer')),
  received_by INTEGER REFERENCES users(id),
  paid_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== STAFF & SHIFTS =====================
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  waiter_id INTEGER REFERENCES waiters(id),
  shift_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','missed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  shift_id INTEGER REFERENCES shifts(id),
  clock_in TEXT,
  clock_out TEXT
);

-- ===================== FINANCE =====================
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== WAITERS =====================
CREATE TABLE IF NOT EXISTS waiters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== ACTIVITY LOG =====================
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  log_type TEXT NOT NULL DEFAULT 'activity' CHECK(log_type IN ('auth','activity')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== SHIFT HANDOVER (X REPORT) =====================
CREATE TABLE IF NOT EXISTS shift_handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  orders_completed INTEGER NOT NULL DEFAULT 0,
  total_sales REAL NOT NULL DEFAULT 0,
  cash_sales REAL NOT NULL DEFAULT 0,
  transfer_sales REAL NOT NULL DEFAULT 0,
  orders_held INTEGER NOT NULL DEFAULT 0,
  orders_voided INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== Z REPORT (END OF DAY CLOSING) =====================
CREATE TABLE IF NOT EXISTS z_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_code TEXT NOT NULL UNIQUE,
  generated_by INTEGER REFERENCES users(id),
  business_date TEXT NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_revenue REAL NOT NULL DEFAULT 0,
  cash_sales REAL NOT NULL DEFAULT 0,
  transfer_sales REAL NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== SIGNUP REQUESTS (owner approval required) =====================
CREATE TABLE IF NOT EXISTS signup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  requested_role TEXT NOT NULL CHECK(requested_role IN ('owner','manager','cashier','finance','chef','storekeeper','fnb')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== KITCHEN INVENTORY (transferred from main store) =====================
CREATE TABLE IF NOT EXISTS kitchen_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER NOT NULL UNIQUE REFERENCES inventory_items(id),
  quantity REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kitchen_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  change_qty REAL NOT NULL,
  qty_before REAL NOT NULL DEFAULT 0,
  qty_after REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK(reason IN ('transfer_in','usage','waste','adjustment')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
