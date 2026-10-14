import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime } from '../../utils/formatters';

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const fetchAlerts = async () => {
      const res = await api.get('/admin/alerts', {
        params: { status: statusFilter },
      });
      setAlerts(res.data.alerts || []);
    };
    fetchAlerts();
  }, [statusFilter]);

  const handleAction = async (id, action) => {
    await api.post(`/admin/approvals/${id}/${action}`);
    const res = await api.get('/admin/alerts', {
      params: { status: statusFilter },
    });
    setAlerts(res.data.alerts || []);
  };

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Alerts" subtitle="Approval and security decision queue" />
        <div className="panel full-width">
          <div className="toolbar-row" style={{ marginBottom: '1rem' }}>
            <label style={{ fontWeight: 600 }}>Filter:</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">ALL</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>

          <table>
            <thead>
              <tr><th>ID</th><th>User</th><th>Type</th><th>Description</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert._id}>
                  <td>{alert._id.slice(0, 10)}</td>
                  <td>{alert.user?.name || 'User'}</td>
                  <td>{alert.type}</td>
                  <td>{alert.details || alert.type}</td>
                  <td>{alert.status}</td>
                  <td>
                    <button className="btn small success" disabled={alert.status !== 'PENDING'} onClick={() => handleAction(alert._id, 'approve')}>{alert.status === 'APPROVED' ? 'Approved' : 'Approve'}</button>
                    <button className="btn small danger" disabled={alert.status !== 'PENDING'} onClick={() => handleAction(alert._id, 'reject')}>{alert.status === 'REJECTED' ? 'Rejected' : 'Reject'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
