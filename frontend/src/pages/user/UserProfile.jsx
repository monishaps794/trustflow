import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { maskAccount } from '../../utils/formatters';

export default function UserProfile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const res = await api.get('/user/profile');
      setProfile(res.data);
    };
    fetchProfile();
  }, []);

  if (!profile) return <div className="loading">Loading profile...</div>;

  return (
    <div className="app-shell">
      <Sidebar role="USER" />
      <main className="content-area">
        <Topbar title="My Profile" subtitle="Profile and account details" />
        <div className="panel">
          <div className="profile-grid">
            <div><strong>Name</strong><span>{profile.name}</span></div>
            <div><strong>Account Type</strong><span>{profile.accountType}</span></div>
            <div><strong>Account Number</strong><span>{maskAccount(profile.accountNumber)}</span></div>
            <div><strong>Email</strong><span>{profile.email}</span></div>
            <div><strong>Phone</strong><span>{profile.phone}</span></div>
            <div><strong>Address</strong><span>{profile.address}</span></div>
            <div><strong>Account Status</strong><span>{profile.accountStatus}</span></div>
            <div><strong>Security Status</strong><span>{profile.securityStatus}</span></div>
          </div>
        </div>
      </main>
    </div>
  );
}
