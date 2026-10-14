import { NavLink } from 'react-router-dom';
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';

const baseItem = ({ to, label }) => (
  <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
    {label}
  </NavLink>
);

export default function Sidebar({ role = 'USER' }) {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const items = role === 'ADMIN'
    ? [
        ['Home', '/admin'],
        ['User Management', '/admin/users'],
        ['Login Monitoring', '/admin/logins'],
        ['Transaction Monitoring', '/admin/transactions'],
        ['Alerts', '/admin/alerts'],
        ['Security Alerts', '/admin/security-alerts'],
        ['Reports / Audit Logs', '/admin/reports'],
        ['Audit Notification', '/admin/audit-notifications'],
        ['Admin Profile', '/admin/profile'],
        ['Settings', '/admin/settings'],
        ['Logout', '/admin/login'],
      ]
    : [
        ['Home', '/user'],
        ['Start Transaction', '/user/transactions/new'],
        ['Transaction History', '/user/transactions'],
        ['Security Log', '/user/security'],
        ['My Profile', '/user/profile'],
        ['Settings', '/user/settings'],
        ['Logout', '/login'],
      ];

  return (
    <aside className="sidebar">
      <div className="brand-wrap">
        <div className="brand-mark">TF</div>
        <div className="brand-copy">
          <span className="brand-name">TrustFlow</span>
          <small>Secure Banking</small>
        </div>
      </div>
      <nav className="nav-menu">
        {items.map(([label, to]) => (
          <NavLink key={to} to={to} onClick={async (event) => {
            if (label !== 'Logout') return;
            event.preventDefault();
            try {
              if (role === 'ADMIN') {
                await api.post('/admin/logout');
              } else {
                await api.post('/user/logout');
              }
            } catch (error) {
              console.warn('Logout request failed.', error);
            } finally {
              logout();
              navigate(role === 'ADMIN' ? '/admin/login' : '/login', { replace: true });
            }
          }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
