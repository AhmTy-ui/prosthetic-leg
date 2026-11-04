import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Auth } from '../lib/data.js';
import Icon from '../components/Icon.jsx';
import { Brand } from '../App.jsx';

export default function Login() {
  const [role, setRole] = useState('patient');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    const r = await Auth.login(username, password, role);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    nav('/dashboard');
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} noValidate>
        <Brand />
        <h1>Sign in</h1>
        <p className="muted small" style={{ margin: 0 }}>Smart prosthetic shoe monitoring</p>

        <div className="segmented" role="tablist" aria-label="Account type">
          {['patient', 'clinician'].map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className={role === r ? 'active' : ''}
              onClick={() => { setRole(r); setError(''); }}>{r === 'patient' ? 'Patient' : 'Clinician'}</button>
          ))}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="field">
          <label htmlFor="u">{role === 'patient' ? 'Patient username' : 'Clinician username'}</label>
          <input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="p">Password</label>
          <input id="p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>

        <div className="demo-box">
          <b>Demo accounts</b><br />
          Patient: <code>patient</code> / <code>patient123</code> (or <code>grace</code>)<br />
          Clinician: <code>clinician</code> / <code>clinic123</code>
        </div>
        <div className="secure-note"><Icon name="lock" size={14} />Patients can only see their own records.</div>
      </form>
    </div>
  );
}
