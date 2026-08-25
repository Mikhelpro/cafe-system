import { useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  LayoutDashboard, ShoppingCart, ChefHat, Package, Table2,
  Users, UserCog, Wallet, BarChart3, Coffee, History, Menu, X, ClipboardList, FileDown
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'finance'] },
  { to: '/pos', label: 'POS', icon: ShoppingCart, roles: ['owner', 'manager', 'cashier'] },
  { to: '/kitchen', label: 'Kitchen / Bar', icon: ChefHat, roles: ['owner', 'manager', 'chef', 'cashier'] },
  { to: '/tables', label: 'Tables & Reservations', icon: Table2, roles: ['owner', 'manager', 'cashier'] },
  { to: '/menu', label: 'Menu', icon: Coffee, roles: ['owner', 'manager'] },
  { to: '/inventory', label: 'Inventory', icon: Package, roles: ['owner', 'manager', 'chef', 'storekeeper'] },
  { to: '/customers', label: 'Customers & Loyalty', icon: Users, roles: ['owner', 'manager', 'cashier'] },
  { to: '/staff', label: 'Staff & Shifts', icon: UserCog, roles: ['owner', 'manager'] },
  { to: '/finance', label: 'Finance', icon: Wallet, roles: ['owner', 'manager', 'finance'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['owner', 'manager', 'finance'] },
  { to: '/fnb', label: 'F&B Sales', icon: ClipboardList, roles: ['owner', 'manager', 'fnb'] },
  { to: '/z-report', label: 'Z Report', icon: FileDown, roles: ['owner', 'manager'] },
  { to: '/activity', label: 'Activity Log', icon: History, roles: ['owner'] },
  { to: '/full-report', label: 'Full Report', icon: FileDown, roles: ['owner'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <div className="mobile-topbar-brand">Piassa <span>Plate</span></div>
      </div>

      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={'sidebar' + (mobileOpen ? ' mobile-open' : '')}>
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">Piassa <span>Plate</span></div>
          <button className="mobile-close-btn" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role">{user.role}</div>
          <button className="logout-btn" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
