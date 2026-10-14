import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime } from '../../utils/formatters';

export default function UserSecurityLog() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const res = await api.get('/user/security-log');
      setData(res.data);
    };
    fetchData();
  }, []);

  if (!data) return <div className="loading">Loading security log...</div>;

  return (
    <div className="app-shell">
      <Sidebar role="USER" />
      <main className="content-area">
        <Topbar title="Security Log" subtitle="Security status, login history, and risk posture" />
        <div className="cards-grid">
          <div className="stat-card"><strong>Security Score</strong><span>{data.securityScore}</span></div>
          <div className="stat-card"><strong>Account Status</strong><span>{data.accountStatus}</span></div>
          <div className="stat-card"><strong>MFA Status</strong><span>{data.mfaStatus === 'ENABLED' ? 'Enabled' : 'Disabled'}</span></div>
          <div className="stat-card"><strong>Last Login</strong><span>{formatDateTime(data.lastLogin)}</span></div>
          <div className="stat-card"><strong>Risk Status</strong><span>{data.riskStatus}</span></div>
          <div className="stat-card"><strong>Failed Login Attempts</strong><span>{data.failedLoginAttempts}</span></div>
        </div>

        <div className="panel-grid">
          <section className="panel"><h3>Recent Security Events</h3><ul className="list">
            {data.recentSecurityEvents.map((item) => <li key={item._id}>{formatDateTime(item.timestamp)} — {item.status} — {item.reason}</li>)}
          </ul></section>
          <section className="panel"><h3>Device Information</h3><ul className="list">
            {data.deviceInformation.map((item, idx) => <li key={idx}>{item.browser} / {item.device} / {item.ipAddress} / {item.location}</li>)}
          </ul></section>
        </div>
      </main>
    </div>
  );
}
