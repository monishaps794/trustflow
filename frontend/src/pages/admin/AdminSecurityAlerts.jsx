import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';

export default function AdminSecurityAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      const res = await api.get('/admin/security-alerts');
      setAlerts(res.data.alerts || []);
    };
    fetchAlerts();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Security Alerts" subtitle="Centralized detection and investigation activity" />
        <div className="panel full-width">
          <table>
            <thead>
              <tr><th>ID</th><th>Event Type</th><th>User / Email</th><th>Reason</th><th>IP</th><th>Location</th><th>Severity</th><th>Risk Score</th><th>Status</th></tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert._id}>
                  <td>{alert._id.slice(0, 10)}</td>
                  <td>{alert.type}</td>
                  <td>{alert.user?.name || alert.relatedLogin?.email || 'Unknown'}</td>
                  <td>{alert.message}</td>
                  <td>{alert.relatedLogin?.ipAddress || 'Unknown'}</td>
                  <td>{alert.relatedLogin?.location || 'Unknown'}</td>
                  <td>{alert.severity}</td>
                  <td>{alert.riskScore}</td>
                  <td>{alert.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
