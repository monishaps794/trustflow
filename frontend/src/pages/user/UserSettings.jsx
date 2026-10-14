import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';

export default function UserSettings() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      const res = await api.get('/user/settings');
      setSettings(res.data.settings);
    };
    fetchSettings();
  }, []);

  const toggle = (field, type) => {
    const next = { ...settings };
    next[type][field] = !next[type][field];
    setSettings(next);
  };

  const saveSettings = async () => {
    const res = await api.put('/user/settings', settings);
    setSettings(res.data.settings);
    setMessage('Settings saved.');
  };

  if (!settings) return <div className="loading">Loading settings...</div>;

  return (
    <div className="app-shell">
      <Sidebar role="USER" />
      <main className="content-area">
        <Topbar title="Settings" subtitle="Notification and security preferences" />
        <div className="panel-grid">
          <section className="panel">
            <h3>Notifications</h3>
            {Object.entries(settings.userNotifications || {}).map(([key, value]) => (
              <div className="toggle-row" key={key}><span>{key}</span><button className="toggle" onClick={() => toggle(key, 'userNotifications')}>{value ? 'ON' : 'OFF'}</button></div>
            ))}
          </section>
          <section className="panel">
            <h3>MFA / Security Settings</h3>
            <div className="toggle-row"><span>MFA Verification</span><button className="toggle" onClick={() => setSettings({ ...settings, mfaEnabled: !settings.mfaEnabled })}>{settings.mfaEnabled ? 'ON' : 'OFF'}</button></div>
            <button className="btn primary" onClick={saveSettings}>Save Settings</button>
            {message && <div className="alert success">{message}</div>}
          </section>
          <section className="panel">
            <h3>Security Preferences</h3>
            {Object.entries(settings.securityPreferences || {}).map(([key, value]) => (
              <div className="toggle-row" key={key}><span>{key}</span><button className="toggle" onClick={() => toggle(key, 'securityPreferences')}>{value ? 'ON' : 'OFF'}</button></div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
