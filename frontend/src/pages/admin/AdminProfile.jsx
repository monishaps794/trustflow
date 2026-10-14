import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';

export default function AdminProfile() {
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    const fetchAdmin = async () => {
      const res = await api.get('/admin/profile');
      setAdmin(res.data.admin);
    };
    fetchAdmin();
  }, []);

  if (!admin) return <div className="loading">Loading admin profile...</div>;

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Admin Profile" subtitle="Administrative profile and access information" />
        <div className="panel">
          <div className="profile-grid">
            <div><strong>Name</strong><span>{admin.name}</span></div>
            <div><strong>Email</strong><span>{admin.email}</span></div>
            <div><strong>Role</strong><span>{admin.role}</span></div>
            <div><strong>MFA Status</strong><span>{admin.mfaEnabled ? 'Enabled' : 'Disabled'}</span></div>
            <div><strong>Last Login</strong><span>{admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'N/A'}</span></div>
          </div>
        </div>
      </main>
    </div>
  );
}
