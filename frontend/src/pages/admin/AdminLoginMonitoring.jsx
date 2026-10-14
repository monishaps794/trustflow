import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime } from '../../utils/formatters';

export default function AdminLoginMonitoring() {
  const [attempts, setAttempts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const fetchData = async () => {
      const res = await api.get('/admin/logins', {
        params: { status: statusFilter },
      });
      setAttempts(res.data.attempts || []);
    };
    fetchData();
  }, [statusFilter]);

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Login Monitoring" subtitle="Live login activity and suspicious behaviors" />
        <div className="panel full-width">
          <div className="toolbar-row" style={{ marginBottom: '1rem' }}>
            <label style={{ fontWeight: 600 }}>Filter:</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">ALL</option>
              <option value="SUCCESS">SUCCESSFUL</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>

          <table>
            <thead>
              <tr><th>User</th><th>Time</th><th>IP</th><th>Device</th><th>Location</th><th>Status</th><th>Risk</th></tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt._id}>
                  <td>{attempt.user?.name || 'User'}</td>
                  <td>{formatDateTime(attempt.timestamp)}</td>
                  <td>{attempt.ipAddress}</td>
                  <td>{attempt.device}</td>
                  <td>{attempt.location}</td>
                  <td>{attempt.status}</td>
                  <td>{attempt.riskLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
