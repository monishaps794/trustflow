import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';

export default function AdminDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const res = await api.get('/admin/dashboard');
      setData(res.data);
    };
    fetchData();
  }, []);

  if (!data) return <div className="loading">Loading admin dashboard...</div>;

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Welcome Admin!" subtitle="Cybersecurity overview and AML dashboard" />
        <div className="cards-grid">
          <div className="stat-card"><strong>Total Users</strong><span>{data.stats.totalUsers}</span></div>
          <div className="stat-card"><strong>Active Users</strong><span>{data.stats.activeUsers}</span></div>
          <div className="stat-card"><strong>Login Attempts</strong><span>{data.stats.loginAttempts}</span></div>
          <div className="stat-card"><strong>Failed Login Attempts</strong><span>{data.stats.failedLoginAttempts}</span></div>
          <div className="stat-card"><strong>Security Alerts</strong><span>{data.stats.securityAlerts}</span></div>
          <div className="stat-card"><strong>High-Risk Transactions</strong><span>{data.stats.highRiskTransactions}</span></div>
          <div className="stat-card"><strong>Pending Approvals</strong><span>{data.stats.pendingApprovals}</span></div>
          <div className="stat-card"><strong>Blocked Activities</strong><span>{data.stats.blockedActivities}</span></div>
        </div>

        <div className="panel full-width">
          <h3>Weekly Activity Graph</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.weeklyActivity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="loginAttempts" stroke="#4f46e5" />
              <Line type="monotone" dataKey="failedLoginAttempts" stroke="#ef4444" />
              <Line type="monotone" dataKey="securityAlerts" stroke="#f59e0b" />
              <Line type="monotone" dataKey="highRiskTransactions" stroke="#8b5cf6" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </main>
    </div>
  );
}
