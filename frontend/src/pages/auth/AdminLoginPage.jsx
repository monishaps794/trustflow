import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { loginAsAdmin } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const requestOtp = async () => {
    setError('');
    try {
      setLoading(true);
      const res = await api.post('/auth/admin/request-otp', { email });
      setOtpSent(true);
      const devOtp = res?.data?.devOtp;
      if (devOtp) {
        setInfo(`OTP generated in fallback mode. Use this OTP: ${devOtp}`);
      } else {
        setInfo('OTP sent to your registered admin email address. Please check your inbox.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid admin email address.';
      setError(msg.includes('register') ? 'Admin account not found. Please register the admin first.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    try {
      setLoading(true);
      const res = await api.post('/auth/admin/verify-otp', { email, otp });
      loginAsAdmin({ admin: res.data.admin, token: res.data.token });
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.message || 'Please enter a valid OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-visual admin-visual">
          <div className="brand-pill">SECURE OPS</div>
          <h1>Command center for risk and compliance.</h1>
          <p>Review suspicious activity, block high-risk transactions, and manage secure approvals in real time.</p>
          <div className="trust-badges">
            <span>Risk Engine</span>
            <span>Behavioral Alerts</span>
            <span>Compliance Ready</span>
          </div>
        </aside>

        <div className="auth-card">
          <h2>TrustFlow Admin Login</h2>
          <div className="field-group">
            <label>Admin Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter admin email" />
          </div>
          <button className="btn primary" onClick={requestOtp} disabled={loading}>{loading ? 'Sending...' : 'Request OTP'}</button>

          {otpSent && (
            <>
              <div className="field-group">
                <label>OTP</label>
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter 6-digit OTP" />
              </div>
              <button className="btn success" onClick={verifyOtp} disabled={loading}>{loading ? 'Verifying...' : 'Login as Admin'}</button>
            </>
          )}

          {error && <div className="alert error">{error}</div>}
          {info && <div className="alert info">{info}</div>}

          <div className="auth-links">
            <Link to="/login">User login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
