import React from 'react';
import { Navigate, NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Login from './pages/Login';
import Enquiries from './pages/Enquiries';
import Quotations from './pages/Quotations';
import SalesOrders from './pages/SalesOrders';

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

const NAV_ITEMS = [
  {
    to: '/enquiries',
    icon: '📋',
    label: 'Enquiries',
    desc: 'Create & manage enquiries',
  },
  {
    to: '/quotations',
    icon: '🧾',
    label: 'Quotations',
    desc: 'Pricing & accept/reject',
  },
  {
    to: '/sales-orders',
    icon: '📦',
    label: 'Sales Orders',
    desc: 'Confirm, reserve & dispatch',
  },
];

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = (user.full_name || user.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>
          <span className="brand-icon">E</span>
          Mini ERP
        </h1>
        <p>Enquiry → Order → Dispatch</p>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Operations</div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          <div className="user-details">
            <div className="user-name">{user.full_name || user.username}</div>
            <div className="user-role">{user.role.replace('_', ' ')}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            ⏻
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <>
      {user && <Sidebar />}
      <div className={user ? 'main-content' : ''}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/enquiries"
            element={
              <Protected>
                <Enquiries />
              </Protected>
            }
          />
          <Route
            path="/quotations"
            element={
              <Protected>
                <Quotations />
              </Protected>
            }
          />
          <Route
            path="/sales-orders"
            element={
              <Protected>
                <SalesOrders />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to={user ? '/enquiries' : '/login'} replace />} />
        </Routes>
      </div>
    </>
  );
}