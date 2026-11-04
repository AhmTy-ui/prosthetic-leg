import { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Auth, AlertStore, LiveHub, PATIENTS, toasts } from './lib/data.js';
import { PatientCtx, useStore } from './hooks.js';
import Icon from './components/Icon.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import History from './pages/History.jsx';
import Alerts from './pages/Alerts.jsx';
import Reports from './pages/Reports.jsx';

const NAV = [
  { to: '/dashboard', label: 'Live dashboard', short: 'Live', icon: 'dashboard' },
  { to: '/history', label: 'History', short: 'History', icon: 'chart' },
  { to: '/alerts', label: 'Alerts', short: 'Alerts', icon: 'bell' },
  { to: '/profile', label: 'Patient profile', short: 'Profile', icon: 'user' },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: 'file', roles: ['clinician'] },
];
const TITLES = { '/dashboard': 'Live dashboard', '/history': 'History', '/alerts': 'Alerts', '/profile': 'Patient profile', '/reports': 'Reports' };

export default function App() {
  useStore();
  const session = Auth.session;
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/*" element={session ? <Shell /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

function Shell() {
  useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const s = Auth.session;
  const allowed = Auth.patients();
  const [selId, setSelId] = useState(() => {
    try { return sessionStorage.getItem('ps_selected') || allowed[0]?.id; } catch { return allowed[0]?.id; }
  });
  // Patients are always locked to their own record
  const patientId = Auth.isClinician() ? (allowed.some((p) => p.id === selId) ? selId : allowed[0]?.id) : s.patientId;
  const patient = PATIENTS.find((p) => p.id === patientId);
  const setPatientId = (id) => { if (!Auth.canAccessPatient(id)) return; setSelId(id); try { sessionStorage.setItem('ps_selected', id); } catch { /* ignore */ } };
  const ctx = useMemo(() => ({ patient, setPatientId }), [patient]);

  const items = NAV.filter((n) => !n.roles || n.roles.includes(s.role));
  const activeAlerts = AlertStore.visible().filter((e) => !e.resolvedAt).length;
  const st = LiveHub.state[patient?.deviceId];
  const online = st?.online;
  const title = TITLES[loc.pathname] || 'Dashboard';

  useEffect(() => { document.title = `${title} · StrideSense`; }, [title]);

  const logout = () => { Auth.logout(); nav('/login'); };

  return (
    <PatientCtx.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <Brand />
          <nav className="nav" aria-label="Main">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to}><Icon name={n.icon} />{n.label}
                {n.to === '/alerts' && activeAlerts > 0 && <span className="badge">{activeAlerts}</span>}</NavLink>
            ))}
          </nav>
          <div className="user-box">
            <div><div className="who">{s.name}</div><span className="role-tag">{s.role}</span></div>
            <div className="small muted">{LiveHub.mode === 'live' ? 'Connected to backend' : LiveHub.mode === 'local' ? 'Offline demo mode' : 'Connecting…'}</div>
            <button className="btn btn-sm" onClick={logout}><Icon name="logout" size={16} />Sign out</button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <span className="mobile-only"><Brand compact /></span>
            <h1>{title}</h1>
            <div className="spacer" />
            {Auth.isClinician() ? (
              <select className="input patient-select" aria-label="Select patient" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                {allowed.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
              </select>
            ) : (
              <span className="chip plain">{patient.name} · {patient.id}</span>
            )}
            <span className={`chip ${online ? 'ok pulse' : 'alert'}`}>{online ? 'Shoe online' : 'Shoe offline'}</span>
            <button className="btn btn-sm mobile-only" onClick={logout} aria-label="Sign out"><Icon name="logout" size={16} /></button>
          </header>

          <main className="content">
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/history" element={<History />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/reports" element={Auth.isClinician() ? <Reports /> : <Forbidden />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>

        <nav className="bottomnav" aria-label="Main">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to}><Icon name={n.icon} />{n.short}
              {n.to === '/alerts' && activeAlerts > 0 && <span className="badge">{activeAlerts}</span>}</NavLink>
          ))}
        </nav>

        <div className="toast-wrap" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.severity === 'alert' ? 'alert' : ''}`}>
              <div className="t">{t.title}</div><div className="d">{t.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </PatientCtx.Provider>
  );
}

export function Brand({ compact }) {
  return (
    <div className="brand">
      <span className="brand-mark"><Icon name="foot" size={20} /></span>
      {!compact && <span>StrideSense</span>}
    </div>
  );
}

function Forbidden() {
  return <div className="card empty"><Icon name="lock" size={28} /><p>Reports are available to clinicians only.</p></div>;
}
