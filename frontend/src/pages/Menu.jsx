import { useEffect, useState, useCallback } from 'react';
import { api, apiErrorMessage } from '../api.js';
import { formatMoney } from '../format.js';

export default function Menu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', category_id: '', price: '', cost: '', station: 'kitchen' });
  const [newCategory, setNewCategory] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', category_id: '', price: '', cost: '', station: 'kitchen' });
  const [linkItem, setLinkItem] = useState(null);
  const [linkRecipe, setLinkRecipe] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [linkForm, setLinkForm] = useState({ inventory_item_id: '', qty_used: 1 });
  const [activeCategory, setActiveCategory] = useState('all');

  const load = useCallback(() => {
    api.get('/menu/items').then((res) => setItems(res.data));
    api.get('/menu/categories').then((res) => setCategories(res.data));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(item) {
    setEditItem(item);
    setEditForm({
      name: item.name,
      category_id: item.category_id || '',
      price: item.price,
      cost: item.cost,
      station: item.station,
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/menu/items/${editItem.id}`, {
        name: editForm.name,
        category_id: editForm.category_id || null,
        price: +editForm.price,
        cost: +editForm.cost,
        station: editForm.station,
      });
      setEditItem(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function openLink(item) {
    setLinkItem(item);
    setLinkForm({ inventory_item_id: '', qty_used: 1 });
    setError('');
    const [recipeRes, invRes] = await Promise.all([
      api.get(`/menu/items/${item.id}/recipe`),
      api.get('/inventory'),
    ]);
    setLinkRecipe(recipeRes.data);
    setInventoryItems(invRes.data);
  }

  async function addLink(e) {
    e.preventDefault();
    setError('');
    if (!linkForm.inventory_item_id) { setError('Please select an inventory item.'); return; }
    try {
      await api.post(`/menu/items/${linkItem.id}/recipe`, {
        inventory_item_id: linkForm.inventory_item_id,
        qty_used: +linkForm.qty_used,
      });
      const res = await api.get(`/menu/items/${linkItem.id}/recipe`);
      setLinkRecipe(res.data);
      setLinkForm({ inventory_item_id: '', qty_used: 1 });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function removeLink(recipeId) {
    await api.delete(`/menu/recipe/${recipeId}`);
    const res = await api.get(`/menu/items/${linkItem.id}/recipe`);
    setLinkRecipe(res.data);
  }

  async function createItem(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/menu/items', {
        ...form,
        category_id: form.category_id || null,
        price: +form.price,
        cost: +form.cost || 0,
      });
      setShowModal(false);
      setForm({ name: '', category_id: '', price: '', cost: '', station: 'kitchen' });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    await api.post('/menu/categories', { name: newCategory.trim() });
    setNewCategory('');
    load();
  }

  async function toggleActive(item) {
    await api.patch(`/menu/items/${item.id}`, { is_active: item.is_active ? 0 : 1 });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Menu Management</div>
          <div className="page-subtitle">Manage items, prices, and categories.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add Item</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Categories</div>
        <div className="flex-row" style={{ flexWrap: 'wrap', marginBottom: 12, gap: 8 }}>
          <button
            className={'tab-btn' + (activeCategory === 'all' ? ' active' : '')}
            style={{ border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px' }}
            onClick={() => setActiveCategory('all')}
          >
            All ({items.length})
          </button>
          {categories.map((c) => {
            const count = items.filter((i) => i.category_id === c.id).length;
            return (
              <button
                key={c.id}
                className={'tab-btn' + (activeCategory === c.id ? ' active' : '')}
                style={{ border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px' }}
                onClick={() => setActiveCategory(c.id)}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex-row">
          <input className="form-input flex-1" placeholder="New category name" value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)} />
          <button className="btn btn-secondary" onClick={addCategory}>Add</button>
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Category</th><th>Price</th><th>Cost</th><th>Margin</th><th>Station</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {(activeCategory === 'all' ? items : items.filter((i) => i.category_id === activeCategory)).map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.category_name || '—'}</td>
              <td>{formatMoney(item.price)}</td>
              <td>{formatMoney(item.cost)}</td>
              <td>{item.price > 0 ? `${(((item.price - item.cost) / item.price) * 100).toFixed(0)}%` : '—'}</td>
              <td style={{ textTransform: 'capitalize' }}>{item.station}</td>
              <td>{item.is_active ? <span className="badge badge-ready">active</span> : <span className="badge badge-cancelled">inactive</span>}</td>
              <td>
                <div className="flex-row">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit Item</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => openLink(item)}>Link Inventory</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(item)}>
                    {item.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {(activeCategory === 'all' ? items : items.filter((i) => i.category_id === activeCategory)).length === 0 && (
            <tr><td colSpan={8}><div className="empty-state">No items in this category yet.</div></td></tr>
          )}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Menu Item</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={createItem}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex-row">
                <div className="form-group flex-1">
                  <label className="form-label">Price (ETB)</label>
                  <input className="form-input" type="number" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Cost (ETB)</label>
                  <input className="form-input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Station</label>
                <select className="form-select" value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })}>
                  <option value="kitchen">Kitchen</option>
                  <option value="bar">Bar</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Edit Item — {editItem.name}</div>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={saveEdit}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" required value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={editForm.category_id}
                  onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Station</label>
                <select className="form-select" value={editForm.station}
                  onChange={(e) => setEditForm({ ...editForm, station: e.target.value })}>
                  <option value="kitchen">Kitchen</option>
                  <option value="bar">Bar</option>
                </select>
              </div>
              <div className="flex-row">
                <div className="form-group flex-1">
                  <label className="form-label">Price (ETB)</label>
                  <input className="form-input" type="number" step="0.01" required value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Cost (ETB)</label>
                  <input className="form-input" type="number" step="0.01" value={editForm.cost}
                    onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditItem(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {linkItem && (
        <div className="modal-overlay" onClick={() => setLinkItem(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Link Inventory — {linkItem.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Every time this item is sold, the linked inventory item(s) below are automatically deducted by the quantity you set.
              For a pre-made item sold as-is (e.g. a bottled soft drink), link it to its matching inventory item with a quantity of 1 —
              selling one Coca-Cola will then reduce "Coca-Cola" stock by exactly 1.
            </div>

            {error && <div className="login-error">{error}</div>}

            <table className="data-table" style={{ marginBottom: 14 }}>
              <thead><tr><th>Inventory Item</th><th>Quantity Used</th><th></th></tr></thead>
              <tbody>
                {linkRecipe.map((r) => (
                  <tr key={r.id}>
                    <td>{r.inventory_name}</td>
                    <td>{r.qty_used} {r.unit}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeLink(r.id)}>Remove</button></td>
                  </tr>
                ))}
                {linkRecipe.length === 0 && (
                  <tr><td colSpan={3}><div className="empty-state">Not linked to any inventory yet — this item won't affect stock when sold.</div></td></tr>
                )}
              </tbody>
            </table>

            <form onSubmit={addLink}>
              <div className="flex-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group flex-1" style={{ marginBottom: 0 }}>
                  <label className="form-label">Inventory Item</label>
                  <select className="form-select" required value={linkForm.inventory_item_id}
                    onChange={(e) => setLinkForm({ ...linkForm, inventory_item_id: e.target.value })}>
                    <option value="">Select item...</option>
                    {inventoryItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, width: 100 }}>
                  <label className="form-label">Qty Used</label>
                  <input className="form-input" type="number" step="0.01" min="0.01" required value={linkForm.qty_used}
                    onChange={(e) => setLinkForm({ ...linkForm, qty_used: e.target.value })} />
                </div>
                <button type="submit" className="btn btn-primary">Add Link</button>
              </div>
            </form>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setLinkItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
