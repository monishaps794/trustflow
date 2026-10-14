import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import AdminLoginPage from './pages/auth/AdminLoginPage';
import UserDashboard from './pages/user/UserDashboard';
import UserTransactions from './pages/user/UserTransactions';
import UserSecurityLog from './pages/user/UserSecurityLog';
import UserProfile from './pages/user/UserProfile';
import UserSettings from './pages/user/UserSettings';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminLoginMonitoring from './pages/admin/AdminLoginMonitoring';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminAlerts from './pages/admin/AdminAlerts';
import AdminSecurityAlerts from './pages/admin/AdminSecurityAlerts';
import AdminReports from './pages/admin/AdminReports';
import AdminNotifications from './pages/admin/AdminNotifications';
import AdminProfile from './pages/admin/AdminProfile';
import AdminSettings from './pages/admin/AdminSettings';
import './styles.css';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />

          <Route path="/user" element={<ProtectedRoute requiredRole="USER"><UserDashboard /></ProtectedRoute>} />
          <Route path="/user/transactions" element={<ProtectedRoute requiredRole="USER"><UserTransactions /></ProtectedRoute>} />
          <Route path="/user/transactions/new" element={<ProtectedRoute requiredRole="USER"><UserTransactions /></ProtectedRoute>} />
          <Route path="/user/security" element={<ProtectedRoute requiredRole="USER"><UserSecurityLog /></ProtectedRoute>} />
          <Route path="/user/profile" element={<ProtectedRoute requiredRole="USER"><UserProfile /></ProtectedRoute>} />
          <Route path="/user/settings" element={<ProtectedRoute requiredRole="USER"><UserSettings /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute requiredRole="ADMIN"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requiredRole="ADMIN"><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/logins" element={<ProtectedRoute requiredRole="ADMIN"><AdminLoginMonitoring /></ProtectedRoute>} />
          <Route path="/admin/transactions" element={<ProtectedRoute requiredRole="ADMIN"><AdminTransactions /></ProtectedRoute>} />
          <Route path="/admin/alerts" element={<ProtectedRoute requiredRole="ADMIN"><AdminAlerts /></ProtectedRoute>} />
          <Route path="/admin/security-alerts" element={<ProtectedRoute requiredRole="ADMIN"><AdminSecurityAlerts /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute requiredRole="ADMIN"><AdminReports /></ProtectedRoute>} />
          <Route path="/admin/audit-notifications" element={<ProtectedRoute requiredRole="ADMIN"><AdminNotifications /></ProtectedRoute>} />
          <Route path="/admin/profile" element={<ProtectedRoute requiredRole="ADMIN"><AdminProfile /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requiredRole="ADMIN"><AdminSettings /></ProtectedRoute>} />
        </Routes>
      </NotificationProvider>
    </AuthProvider>
  );
}
