import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime, maskAccount } from '../../utils/formatters';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      const res = await api.get('/admin/users');
      setUsers(res.data.users || []);
    };
    fetchUsers();
  }, []);

  const showUser = async (id) => {
    const res = await api.get(`/admin/users/${id}`);
    setSelected(res.data);
  };

  return (
    <div className="app-shell">
      <Sidebar role="ADMIN" />
      <main className="content-area">
        <Topbar title="User Management" subtitle="Search, filter, review, and secure accounts" />
        <div className="panel full-width">
          <h3>Registered Users</h3>
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Account</th><th>Status</th><th>Risk</th><th>Action</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{maskAccount(user.accountNumber)}</td>
                  <td>{user.accountStatus}</td>
                  <td>{user.riskLevel}</td>
                  <td><button className="btn small" onClick={() => showUser(user._id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="panel full-width">
            <h3>User Details</h3>
            <div className="profile-grid">
              <div><strong>Name</strong><span>{selected.user.name}</span></div>
              <div><strong>Email</strong><span>{selected.user.email}</span></div>
              <div><strong>Phone</strong><span>{selected.user.phone}</span></div>
              <div><strong>Address</strong><span>{selected.user.address}</span></div>
              <div><strong>Account Type</strong><span>{selected.user.accountType}</span></div>
              <div><strong>Registration Date</strong><span>{formatDateTime(selected.user.createdAt)}</span></div>
            </div>
            <h4>Login History</h4>
            <ul className="list">
              {selected.loginHistory.map((login) => (
                <li key={login._id}>{formatDateTime(login.timestamp)} | {login.status} | {login.ipAddress} | {login.riskLevel}</li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
