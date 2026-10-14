import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { AuthContext } from '../../context/AuthContext';
import { useContext } from 'react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginAsUser } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleRequestOtp = async () => {
    setError('');
    setWarning('');
    setLoading(true);
    try {
      const res = await api.post('/auth/user/request-otp', { email });
      setOtpSent(true);
      const devOtp = res?.data?.devOtp;
      if (devOtp) {
        setWarning(`OTP generated in fallback mode. Use this OTP: ${devOtp}`);
      } else {
        setWarning('OTP sent to your registered email address. Please check your inbox.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    setError('');
    if (!otp || otp.length < 6) {
      setError('Please enter a valid OTP.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/user/verify-otp', { email, otp });
      if (res.data.user) {
        setWarning('OTP verified successfully.');
        const riskRes = await api.post('/auth/user/login-risk-check', { email });

        if (riskRes.data.status === 'SUSPICIOUS') {
          setWarning('Suspicious activity detected. Login behavior is unusual. Do you want to continue?');
          const continueRes = window.confirm('Suspicious activity detected. Login behavior is unusual. Do you want to continue?');
          if (continueRes) {
            const approval = await api.post('/auth/user/suspicious-login/continue', { loginAttemptId: riskRes.data.loginAttemptId });
            setWarning(approval.data.message);
            return;
          }
          await api.post('/auth/user/suspicious-login/cancel', { loginAttemptId: riskRes.data.loginAttemptId });
          setError('Login attempt canceled.');
          return;
        }

        loginAsUser({ user: res.data.user, token: riskRes.data.token });
        navigate('/user');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Please enter a valid OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-visual">
          <div className="brand-pill">TRUSTFLOW</div>
          <h1>Secure digital banking for confident decisions.</h1>
          <p>Realtime fraud prevention, intelligent risk scoring, and trusted transaction monitoring for every user.</p>
          <div className="trust-badges">
            <span>24/7 Monitoring</span>
            <span>AML Protection</span>
            <span>Secure Access</span>
          </div>
        </aside>

        <div className="auth-card">
          <h2>TrustFlow User Login</h2>
          <div className="field-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter registered email" />
          </div>
          <button className="btn primary" onClick={handleRequestOtp} disabled={loading}>{loading ? 'Sending...' : 'Request OTP'}</button>

          {otpSent && (
            <>
              <div className="field-group">
                <label>OTP</label>
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter 6-digit OTP" />
              </div>
              <button className="btn success" onClick={handleOtpVerify} disabled={loading}>{loading ? 'Verifying...' : 'Login'}</button>
            </>
          )}

          {error && <div className="alert error">{error}</div>}
          {warning && <div className="alert info">{warning}</div>}

          <div className="auth-links">
            <Link to="/admin/login">Admin login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
