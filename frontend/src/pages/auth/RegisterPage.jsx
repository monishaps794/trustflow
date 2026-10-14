import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    accountNumber: '',
    accountHolderType: 'INDIVIDUAL',
    email: '',
    phone: '',
    address: '',
    accountType: 'SAVINGS',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      const res = await api.post('/auth/user/register', form);
      setSuccess(res.data.message);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout register-layout">
        <aside className="auth-visual">
          <div className="brand-pill">SAFE BANKING</div>
          <h1>Open your secure account with confidence.</h1>
          <p>Protect your transactions with AML monitoring, smart approvals, and continuous security checks.</p>
          <div className="trust-badges">
            <span>KYC Verified</span>
            <span>Fraud Defense</span>
            <span>Trusted Platform</span>
          </div>
        </aside>

        <div className="auth-card wide">
          <h2>Register New User</h2>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="field-group">
              <label>Name</label>
              <input name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="field-group">
              <label>Account Number</label>
              <input name="accountNumber" value={form.accountNumber} onChange={handleChange} required />
            </div>
            <div className="field-group">
              <label>Account Holder Type</label>
              <select name="accountHolderType" value={form.accountHolderType} onChange={handleChange}>
                <option value="INDIVIDUAL">INDIVIDUAL</option>
                <option value="JOINT">JOINT</option>
                <option value="BUSINESS">BUSINESS</option>
              </select>
            </div>
            <div className="field-group">
              <label>Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required />
            </div>
            <div className="field-group">
              <label>Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} required />
            </div>
            <div className="field-group">
              <label>Account Type</label>
              <select name="accountType" value={form.accountType} onChange={handleChange}>
                <option value="SAVINGS">SAVINGS</option>
                <option value="CURRENT">CURRENT</option>
                <option value="FIXED_DEPOSIT">FIXED_DEPOSIT</option>
              </select>
            </div>
            <div className="field-group full-width">
              <label>Address</label>
              <textarea name="address" value={form.address} onChange={handleChange} required />
            </div>
            <button className="btn primary full-width" type="submit" disabled={loading}>{loading ? 'Registering...' : 'Register'}</button>
          </form>
          {error && <div className="alert error">{error}</div>}
          {success && <div className="alert success">{success}</div>}
          <div className="auth-links"><Link to="/login">Back to User Login</Link></div>
        </div>
      </div>
    </div>
  );
}
