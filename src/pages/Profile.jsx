import { useState } from 'react';
import { Auth, LiveHub, Notes, fmtDateTime, timeAgo } from '../lib/data.js';
import { usePatient, useStore } from '../hooks.js';
import Icon from '../components/Icon.jsx';

const initials = (n) => n.split(' ').map((x) => x[0]).slice(0, 2).join('');

export default function Profile() {
  useStore();
  const { patient, setPatientId } = usePatient();
  const [text, setText] = useState('');
  const clin = Auth.isClinician();
  const st = LiveHub.state[patient.deviceId] || {};
  const notes = Notes.get(patient.id);

  const save = (e) => { e.preventDefault(); if (!text.trim()) return; Notes.add(patient.id, text.trim()); setText(''); };

  return (
    <div className={clin ? 'profile-grid' : ''}>
      {clin && (
        <div className="card">
          <div className="card-head"><h2>Patients</h2><span className="muted small">{Auth.patients().length}</span></div>
          <div className="patient-list">
            {Auth.patients().map((p) => {
              const on = LiveHub.state[p.deviceId]?.online;
              return (
                <button key={p.id} className={`patient-item ${p.id === patient.id ? 'active' : ''}`} onClick={() => setPatientId(p.id)}>
                  <span className="avatar">{initials(p.name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{p.name}</b><br /><span className="small muted">{p.id} · {p.deviceId}</span></span>
                  <span className={`chip ${on ? 'ok' : 'alert'}`}>{on ? 'Online' : 'Offline'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="stack">
        <div className="card">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
            <span className="avatar lg">{initials(patient.name)}</span>
            <div><h2 style={{ fontSize: 20 }}>{patient.name}</h2><div className="muted">Patient ID {patient.id}</div></div>
          </div>
          <div className="grid-2">
            <dl className="kv">
              <dt>Patient ID</dt><dd>{patient.id}</dd>
              <dt>Date of birth</dt><dd>{new Date(patient.dob).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
              <dt>Prosthesis side</dt><dd>{patient.side}</dd>
              <dt>Clinician</dt><dd>{patient.clinician}</dd>
            </dl>
            <dl className="kv">
              <dt>Assigned device</dt><dd><Icon name="device" size={15} style={{ verticalAlign: -2 }} /> {patient.deviceId}</dd>
              <dt>Device fitted</dt><dd>{new Date(patient.fittedOn).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
              <dt>Firmware</dt><dd>{patient.firmware}</dd>
              <dt>Device status</dt><dd><span className={`chip ${st.online ? 'ok' : 'alert'}`}>{st.online ? 'Online' : 'Offline'}</span> <span className="small muted">last data {timeAgo(st.lastSeen)}</span></dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>Clinician notes</h2>{!clin && <span className="muted small">Shared with you by your care team</span>}</div>
          {clin && (
            <form onSubmit={save} style={{ marginBottom: 20 }}>
              <div className="field"><label htmlFor="note">Add a note</label>
                <textarea id="note" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Reviewed walking pattern, adjust liner at next visit" /></div>
              <button className="btn btn-primary">Save note</button>
            </form>
          )}
          {notes.length === 0 && <p className="muted">No notes yet.</p>}
          {notes.map((n, i) => (
            <div className="note" key={i}><div className="meta">{n.by} · {fmtDateTime(n.at)}</div>{n.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
