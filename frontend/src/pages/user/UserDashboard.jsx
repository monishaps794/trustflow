import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime, maskAccount, toCurrency } from '../../utils/formatters';

export default function UserDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await api.get('/user/dashboard');
        setDashboard(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!dashboard) return <div className="loading">No dashboard data available.</div>;

  const user = dashboard.user;
  return (
    <div className="app-shell">
      <Sidebar role="USER" />
      <main className="content-area">
        <Topbar title={`Welcome, ${user.name}!`} subtitle="TrustFlow user security dashboard" />
        <div className="cards-grid">
          <div className="stat-card"><strong>Account Number</strong><span>{maskAccount(user.accountNumber)}</span></div>
          <div className="stat-card"><strong>Account Type</strong><span>{user.accountType}</span></div>
          <div className="stat-card"><strong>Account Status</strong><span>{user.accountStatus}</span></div>
          <div className="stat-card"><strong>Last Login</strong><span>{formatDateTime(user.lastLogin)}</span></div>
          <div className="stat-card"><strong>Security Status</strong><span>{user.securityStatus}</span></div>
          <div className="stat-card"><strong>Risk Level</strong><span>{user.riskLevel}</span></div>
        </div>

        <div className="quick-actions">
          <Link className="btn primary" to="/user">Home</Link>
          <Link className="btn primary" to="/user/transactions/new">Start New Transaction</Link>
          <Link className="btn primary" to="/user/transactions">View History</Link>
          <Link className="btn primary" to="/user/profile">My Account</Link>
        </div>

        <div className="panel-grid">
          <section className="panel">
            <h3>Recent Transactions</h3>
            <table>
              <thead>
                <tr><th>Recipient</th><th>Amount</th><th>Status</th><th>Risk</th></tr>
              </thead>
              <tbody>
                {dashboard.transactions.slice(0, 5).map((tx) => (
                  <tr key={tx._id}>
                    <td>{tx.recipientName}</td>
                    <td>{toCurrency(tx.amount)}</td>
                    <td>{tx.status}</td>
                    <td><span className={`badge ${tx.riskLevel?.toLowerCase()}`}>{tx.riskLevel}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h3>Recent Security Events</h3>
            <ul className="list">
              {dashboard.securityEvents.slice(0, 5).map((event) => (
                <li key={event._id}><strong>{event.status}</strong> — {event.reason} ({event.riskLevel})</li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
