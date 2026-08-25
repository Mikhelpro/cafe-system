import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, logActivity } from '../db.js';
import { signToken, requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user) {
    logActivity(null, 'login_failed', `Failed login attempt for ${email}`, 'auth');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    logActivity(user.id, 'login_failed', `Failed login attempt for ${email}`, 'auth');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  logActivity(user.id, 'login_success', `${user.name} (${user.role}) logged in`, 'auth');
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Public: request a new account. Does NOT create a login yet — sits pending until
// the owner approves it. Anyone can submit one, no auth required.
router.post('/signup', (req, res) => {
  const { name, email, password, requested_role } = req.body;
  if (!name || !email || !password || !requested_role) {
    return res.status(400).json({ error: 'name, email, password, and role are required' });
  }
  const validRoles = ['owner', 'manager', 'cashier', 'finance', 'chef', 'storekeeper', 'fnb'];
  if (!validRoles.includes(requested_role)) return res.status(400).json({ error: 'Invalid role' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) return res.status(409).json({ error: 'An account with this email already exists' });

  const existingPending = db.prepare("SELECT id FROM signup_requests WHERE email = ? AND status = 'pending'").get(email);
  if (existingPending) return res.status(409).json({ error: 'A request for this email is already pending owner approval' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO signup_requests (name, email, password_hash, requested_role) VALUES (?,?,?,?)'
  ).run(name, email, hash, requested_role);

  logActivity(null, 'signup_requested', `${name} (${email}) requested a ${requested_role} account`, 'auth');
  res.status(201).json({ id: result.lastInsertRowid });
});

// Owner-only: list signup requests (pending by default)
router.get('/signup-requests', requireAuth, requireRole(), (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM signup_requests';
  const params = [];
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Owner-only: approve a request — creates the real user account
router.post('/signup-requests/:id/approve', requireAuth, requireRole(), (req, res) => {
  const request = db.prepare("SELECT * FROM signup_requests WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Pending request not found' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(request.email);
  if (existingUser) {
    db.prepare("UPDATE signup_requests SET status = 'denied', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?")
      .run(req.user.id, req.params.id);
    return res.status(409).json({ error: 'An account with this email was already created elsewhere; request auto-denied' });
  }

  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
    .run(request.name, request.email, request.password_hash, request.requested_role);
  db.prepare("UPDATE signup_requests SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?")
    .run(req.user.id, req.params.id);

  logActivity(req.user.id, 'signup_approved', `Approved ${request.name} (${request.email}) as ${request.requested_role}`);
  res.json({ ok: true });
});

// Owner-only: deny a request — no account is created
router.post('/signup-requests/:id/deny', requireAuth, requireRole(), (req, res) => {
  const request = db.prepare("SELECT * FROM signup_requests WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Pending request not found' });

  db.prepare("UPDATE signup_requests SET status = 'denied', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?")
    .run(req.user.id, req.params.id);

  logActivity(req.user.id, 'signup_denied', `Denied ${request.name} (${request.email})`);
  res.json({ ok: true });
});

// User management - owner/manager only
// Lightweight staff list (no email) — any authenticated user can see this,
// used for things like transferring an order to another cashier at shift change
router.get('/staff-list', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, name, role FROM users WHERE active = 1 ORDER BY name').all();
  res.json(users);
});

router.get('/users', requireAuth, requireRole('manager'), (req, res) => {
  const cols = req.user.role === 'owner'
    ? 'id, name, email, role, active, current_password, created_at'
    : 'id, name, email, role, active, created_at';
  const users = db.prepare(`SELECT ${cols} FROM users ORDER BY id`).all();
  res.json(users);
});

router.post('/users', requireAuth, requireRole('manager'), (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, role are required' });
  }
  const validRoles = ['owner', 'manager', 'cashier', 'finance', 'chef', 'storekeeper', 'fnb'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  // Only owner can create another owner or manager
  if ((role === 'owner' || role === 'manager') && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owner can create owner/manager accounts' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare('INSERT INTO users (name, email, password_hash, current_password, role) VALUES (?,?,?,?,?)')
      .run(name, email, hash, password, role);
    logActivity(req.user.id, 'staff_account_created', `${name} (${email}) as ${role}`);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/users/:id', requireAuth, requireRole('manager'), (req, res) => {
  const { name, role, active, password } = req.body;
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
  if (role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  if (active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ?, current_password = ? WHERE id = ?').run(hash, password, id);
  }
  res.json({ ok: true });
});

export default router;
