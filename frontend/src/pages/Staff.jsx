import { useEffect, useState, useCallback } from 'react';
import { api, apiErrorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Staff() {
  const { user } = useAuth();
  const [tab, setTab] = useState('shifts');
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showWaiterModal, setShowWaiterModal] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ waiter_id: '', shift_date: '', start_time: '09:00', end_time: '17:00' });
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'cashier' });
  const [waiterForm, setWaiterForm] = useState({ name: '' });
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', password: '' });
  const [editWaiter, setEditWaiter] = useState(null);
  const [editWaiterName, setEditWaiterName] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);

  const load = useCallback(() => {
    api.get('/staff/shifts').then((res) => setShifts(res.data));
    api.get('/auth/users').then((res) => setUsers(res.data));
    api.get('/waiters').then((res) => setWaiters(res.data));
    if (user.role === 'owner') {
      api.get('/auth/signup-requests', { params: { status: 'pending' } }).then((res) => setPendingRequests(res.data));
    }
  }, [user.role]);

  useEffect(() => { load(); }, [load]);

  async function createWaiter(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/waiters', waiterForm);
      setShowWaiterModal(false);
      setWaiterForm({ name: '' });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function openEditWaiter(w) {
    setEditWaiter(w);
    setEditWaiterName(w.name);
  }

  async function saveEditWaiter(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/waiters/${editWaiter.id}`, { name: editWaiterName });
      setEditWaiter(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function removeWaiter(w) {
    await api.delete(`/waiters/${w.id}`);
    load();
  }

  async function approveRequest(reqItem) {
    setError('');
    try {
      await api.post(`/auth/signup-requests/${reqItem.id}/approve`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function denyRequest(reqItem) {
    setError('');
    try {
      await api.post(`/auth/signup-requests/${reqItem.id}/deny`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function createShift(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/staff/shifts', form);
      setShowModal(false);
      setForm({ waiter_id: '', shift_date: '', start_time: '09:00', end_time: '17:00' });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function createUser(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/users', userForm);
      setShowUserModal(false);
      setUserForm({ name: '', email: '', password: '', role: 'cashier' });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function toggleActive(user) {
    await api.patch(`/auth/users/${user.id}`, { active: user.active ? 0 : 1 });
    load();
  }

  function openEdit(user) {
    setEditUser(user);
    setEditForm({ name: user.name, role: user.role, password: '' });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { name: editForm.name, role: editForm.role };
      if (editForm.password) payload.password = editForm.password;
      await api.patch(`/auth/users/${editUser.id}`, payload);
      setEditUser(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function deleteShift(id) {
    await api.delete(`/staff/shifts/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Staff & Shifts</div>
          <div className="page-subtitle">Manage employees and their work schedule.</div>
        </div>
        <button className="btn btn-primary" onClick={() => (tab === 'shifts' ? setShowModal(true) : tab === 'users' ? setShowUserModal(true) : tab === 'waiters' ? setShowWaiterModal(true) : null)}>
          {tab === 'shifts' ? 'Add Shift' : tab === 'users' ? 'Add Staff Member' : tab === 'waiters' ? 'Add Waiter' : ''}
        </button>
      </div>

      <div className="tabs">
        <button className={'tab-btn' + (tab === 'shifts' ? ' active' : '')} onClick={() => setTab('shifts')}>Shifts</button>
        <button className={'tab-btn' + (tab === 'users' ? ' active' : '')} onClick={() => setTab('users')}>Staff Accounts</button>
        <button className={'tab-btn' + (tab === 'waiters' ? ' active' : '')} onClick={() => setTab('waiters')}>Waiters</button>
        {user.role === 'owner' && (
          <button className={'tab-btn' + (tab === 'requests' ? ' active' : '')} onClick={() => setTab('requests')}>
            Account Requests {pendingRequests.length > 0 ? `(${pendingRequests.length})` : ''}
          </button>
        )}
      </div>

      {tab === 'requests' && (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Requested Role</th><th>Submitted</th><th></th></tr></thead>
          <tbody>
            {pendingRequests.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td style={{ textTransform: 'capitalize' }}>{r.requested_role}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>
                  <div className="flex-row">
                    <button className="btn btn-primary btn-sm" onClick={() => approveRequest(r)}>Approve</button>
                    <button className="btn btn-danger btn-sm" onClick={() => denyRequest(r)}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
            {pendingRequests.length === 0 && (
              <tr><td colSpan={5}><div className="empty-state">No pending account requests.</div></td></tr>
            )}
          </tbody>
        </table>
      )}

      {tab === 'shifts' && (
        <table className="data-table">
          <thead><tr><th>Waiter</th><th>Date</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>{s.waiter_name || s.user_name || '—'}</td>
                <td>{s.shift_date}</td>
                <td>{s.start_time}</td>
                <td>{s.end_time}</td>
                <td style={{ textTransform: 'capitalize' }}>{s.status}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => deleteShift(s.id)}>Remove</button></td>
              </tr>
            ))}
            {shifts.length === 0 && <tr><td colSpan={6}><div className="empty-state">No shifts scheduled.</div></td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'users' && (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th>{user.role === 'owner' && <th>Current Password</th>}<th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                {user.role === 'owner' && (
                  <td><code style={{ fontSize: 12 }}>{u.current_password || '—'}</code></td>
                )}
                <td>{u.active ? <span className="badge badge-ready">active</span> : <span className="badge badge-cancelled">disabled</span>}</td>
                <td>
                  <div className="flex-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'waiters' && (
        <table className="data-table">
          <thead><tr><th>Waiter Name</th><th></th></tr></thead>
          <tbody>
            {waiters.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td>
                  <div className="flex-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditWaiter(w)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeWaiter(w)}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {waiters.length === 0 && <tr><td colSpan={2}><div className="empty-state">No waiters added yet — add them here so cashiers can select them at checkout in POS.</div></td></tr>}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Shift</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={createShift}>
              <div className="form-group">
                <label className="form-label">Waiter</label>
                <select className="form-select" required value={form.waiter_id} onChange={(e) => setForm({ ...form, waiter_id: e.target.value })}>
                  <option value="">Select waiter...</option>
                  {waiters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {waiters.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    No waiters added yet — add them in the Waiters tab first.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" required value={form.shift_date} onChange={(e) => setForm({ ...form, shift_date: e.target.value })} />
              </div>
              <div className="flex-row">
                <div className="form-group flex-1">
                  <label className="form-label">Start</label>
                  <input className="form-input" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">End</label>
                  <input className="form-input" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Shift</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Staff Member</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={createUser}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" required value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Temporary Password</label>
                <input className="form-input" type="text" required value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                  <option value="cashier">Cashier</option>
                  <option value="chef">Chef</option>
                  <option value="storekeeper">Storekeeper</option>
                  <option value="fnb">F&B</option>
                  <option value="finance">Finance</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowUserModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Edit Staff Member</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{editUser.email}</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={saveEdit}>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input className="form-input" required value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="cashier">Cashier</option>
                  <option value="chef">Chef</option>
                  <option value="storekeeper">Storekeeper</option>
                  <option value="fnb">F&B</option>
                  <option value="finance">Finance</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reset Password (optional)</label>
                <input className="form-input" type="text" placeholder="Leave blank to keep current password"
                  value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showWaiterModal && (
        <div className="modal-overlay" onClick={() => setShowWaiterModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Waiter</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={createWaiter}>
              <div className="form-group">
                <label className="form-label">Waiter Name</label>
                <input className="form-input" required value={waiterForm.name}
                  onChange={(e) => setWaiterForm({ name: e.target.value })} placeholder="e.g. Selam" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowWaiterModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Waiter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editWaiter && (
        <div className="modal-overlay" onClick={() => setEditWaiter(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Edit Waiter</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={saveEditWaiter}>
              <div className="form-group">
                <label className="form-label">Waiter Name</label>
                <input className="form-input" required value={editWaiterName}
                  onChange={(e) => setEditWaiterName(e.target.value)} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditWaiter(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
