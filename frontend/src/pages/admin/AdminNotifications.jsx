import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime } from '../../utils/formatters';

export default function AdminNotifications() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      const res = await api.get('/admin/audit-logs');
      setLogs(res.data.logs || []);
    };
    fetchLogs();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Audit Notification" subtitle="Administrative notifications from security activity" />
        <div className="panel full-width">
          <ul className="list">
            {logs.slice(0, 20).map((log) => (
              <li key={log._id}>{formatDateTime(log.timestamp)} | {log.actorRole} | {log.action} | {log.status}</li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
