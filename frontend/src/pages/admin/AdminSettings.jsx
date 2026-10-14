import { useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';

export default function AdminSettings() {
  const [form, setForm] = useState({
    password: '',
    mfaEnabled: true,
    securityNotifications: true,
    transactionNotifications: true,
    loginNotifications: true,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.put('/admin/settings', {
      userNotifications: {
        securityNotifications: form.securityNotifications,
        transactionNotifications: form.transactionNotifications,
        loginNotifications: form.loginNotifications,
      },
      securityPreferences: {
        otpVerification: form.mfaEnabled,
        loginAlerts: form.loginNotifications,
        transactionAlerts: form.transactionNotifications,
      },
    });
    alert('Admin settings updated successfully.');
  };

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Admin Settings" subtitle="Password, MFA, notifications, and session preferences" />
        <div className="panel">
          <form onSubmit={handleSubmit} className="transaction-form">
            <div className="field-group"><label>Password Change</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="New password" /></div>
            <div className="field-group"><label>MFA / Security Settings</label><select value={form.mfaEnabled} onChange={(e) => setForm({ ...form, mfaEnabled: e.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></div>
            <div className="field-group"><label>Security Notifications</label><select value={form.securityNotifications} onChange={(e) => setForm({ ...form, securityNotifications: e.target.value === 'true' })}><option value="true">ON</option><option value="false">OFF</option></select></div>
            <div className="field-group"><label>Transaction Notifications</label><select value={form.transactionNotifications} onChange={(e) => setForm({ ...form, transactionNotifications: e.target.value === 'true' })}><option value="true">ON</option><option value="false">OFF</option></select></div>
            <div className="field-group"><label>Login Notifications</label><select value={form.loginNotifications} onChange={(e) => setForm({ ...form, loginNotifications: e.target.value === 'true' })}><option value="true">ON</option><option value="false">OFF</option></select></div>
            <button className="btn primary" type="submit">Save Settings</button>
          </form>
        </div>
      </main>
    </div>
  );
}
