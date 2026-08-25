import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, apiErrorMessage } from '../api.js';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [signupForm, setSignupForm] = useState({ name: '', email: '', password: '', requested_role: 'cashier' });
  const [signupSuccess, setSignupSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/signup', signupForm);
      setSignupSuccess(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function switchToSignup() {
    setMode('signup');
    setError('');
    setSignupSuccess(false);
  }

  function switchToLogin() {
    setMode('login');
    setError('');
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">Piassa <span>Plate</span></div>
        <div className="login-subtitle">
          {mode === 'login' ? 'Sign in to manage your store' : 'Request an account'}
        </div>

        {error && <div className="login-error">{error}</div>}

        {mode === 'login' && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', padding: 4, color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={switchToSignup}
            >
              Create Account
            </button>
          </form>
        )}

        {mode === 'signup' && !signupSuccess && (
          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                required
                value={signupForm.name}
                onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                required
                value={signupForm.email}
                onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                required
                value={signupForm.password}
                onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                className="form-select"
                value={signupForm.requested_role}
                onChange={(e) => setSignupForm({ ...signupForm, requested_role: e.target.value })}
              >
                <option value="cashier">Cashier</option>
                <option value="chef">Chef</option>
                <option value="storekeeper">Storekeeper</option>
                <option value="fnb">F&B</option>
                <option value="finance">Finance</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Your account won't be active until the owner reviews and approves this request.
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Submitting…' : 'Submit Request'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={switchToLogin}
            >
              Back to Sign In
            </button>
          </form>
        )}

        {mode === 'signup' && signupSuccess && (
          <div>
            <div className="login-error" style={{ background: 'var(--cream-dark)', color: 'var(--text)' }}>
              Request submitted! The owner needs to approve it before you can sign in. Check back later or ask them directly.
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={switchToLogin}
            >
              Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
