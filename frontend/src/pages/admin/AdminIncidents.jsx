import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime } from '../../utils/formatters';

export default function AdminIncidents() {
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    const fetchIncidents = async () => {
      const res = await api.get('/admin/incidents');
      setIncidents(res.data.incidents || []);
    };
    fetchIncidents();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Security Incidents" subtitle="Investigation tracking and resolution logs" />
        <div className="panel full-width">
          <table>
            <thead>
              <tr><th>ID</th><th>User</th><th>Type</th><th>Severity</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident._id}>
                  <td>{incident._id.slice(0, 10)}</td>
                  <td>{incident.user?.name || 'User'}</td>
                  <td>{incident.type}</td>
                  <td>{incident.severity}</td>
                  <td>{incident.status}</td>
                  <td>{formatDateTime(incident.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
