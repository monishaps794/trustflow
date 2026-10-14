import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime, maskAccount, toCurrency } from '../../utils/formatters';

export default function AdminTransactions() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const res = await api.get('/admin/users');
      setUsers(res.data.users || []);
    };
    fetchData();
  }, []);

  const showUserTransactions = async (user) => {
    const res = await api.get(`/admin/users/${user._id}/transactions`);
    setSelected(res.data.user);
    setTransactions(res.data.transactions || []);
  };

  const blockTransaction = async (id) => {
    await api.post(`/admin/transactions/${id}/block`);
    await showUserTransactions(selected);
  };

  const unblockTransaction = async (id) => {
    await api.post(`/admin/transactions/${id}/unblock`);
    await showUserTransactions(selected);
  };

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="Transaction Monitoring" subtitle="Review and manage payment activity across the system" />
        <div className="panel full-width">
          <table>
            <thead>
              <tr><th>User ID</th><th>Name</th><th>Account Type</th><th>Account Status</th><th>Security Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td>{user._id.slice(0, 10)}</td>
                  <td>{user.name}</td>
                  <td>{user.accountType}</td>
                  <td>{user.accountStatus}</td>
                  <td>{user.securityStatus}</td>
                  <td>
                    <button className="btn small" onClick={() => showUserTransactions(user)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && <div className="panel full-width">
          <h3>{selected.name} Transaction History</h3>
          <table>
            <thead><tr><th>ID</th><th>Recipient</th><th>Bank</th><th>Account</th><th>Amount</th><th>Purpose</th><th>Status</th><th>Risk</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>{transactions.map((tx) => (
              <tr key={tx._id}>
                <td>{tx._id.slice(0, 10)}</td><td>{tx.recipientName}</td><td>{tx.recipientBankName || 'N/A'}</td><td>{maskAccount(tx.recipientAccount)}</td><td>{toCurrency(tx.amount)}</td><td>{tx.purpose}</td><td>{tx.status}</td><td>{tx.riskLevel} ({tx.riskScore})</td><td>{formatDateTime(tx.createdAt)}</td>
                <td>{tx.status === 'BLOCKED' ? <button className="btn small" onClick={() => unblockTransaction(tx._id)}>UNBLOCK</button> : (['HIGH', 'CRITICAL'].includes(tx.riskLevel) || tx.status === 'PENDING_ADMIN_APPROVAL') && <button className="btn small danger" onClick={() => blockTransaction(tx._id)}>BLOCK</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </main>
    </div>
  );
}
