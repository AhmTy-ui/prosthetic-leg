import { useState } from 'react';
import { ALERT_TYPES, AlertStore, Auth, PATIENTS, fmtDateTime } from '../lib/data.js';
import { useStore } from '../hooks.js';
import Icon from '../components/Icon.jsx';

export default function Alerts() {
  useStore();
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [who, setWho] = useState('all');
  const clin = Auth.isClinician();

  let list = AlertStore.visible();
  if (type !== 'all') list = list.filter((e) => e.type === type);
  if (status === 'active') list = list.filter((e) => !e.resolvedAt);
  if (status === 'unack') list = list.filter((e) => !e.ackBy);
  if (clin && who !== 'all') list = list.filter((e) => e.patientId === who);
  const activeCount = AlertStore.visible().filter((e) => !e.resolvedAt).length;

  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="tablist" style={{ flexWrap: 'wrap' }}>
          {[['all', 'All'], ...Object.entries(ALERT_TYPES)].map(([k, v]) => (
            <button key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>{v}</button>
          ))}
        </div>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="all">All statuses</option><option value="active">Active now ({activeCount})</option><option value="unack">Not yet reviewed</option>
        </select>
        {clin && (
          <select className="input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Patient">
            <option value="all">All patients</option>{PATIENTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="alert-list">
        {list.length === 0 && <div className="card empty"><Icon name="check" size={28} /><p>No alerts match these filters.</p></div>}
        {list.slice(0, 150).map((e) => {
          const pt = PATIENTS.find((p) => p.id === e.patientId);
          const active = !e.resolvedAt;
          return (
            <div key={e.id} className={`alert-item ${e.severity}`}>
              <span className="sev" />
              <div>
                <div className="t">{e.title}
                  <span className={`chip ${active ? (e.severity === 'alert' ? 'alert' : 'warn') : 'ok'}`}>{active ? 'Active' : 'Cleared'}</span>
                  <span className="chip plain">{ALERT_TYPES[e.type]}</span>
                </div>
                <div className="d">{e.detail}</div>
                <div className="d">{clin && <>{pt?.name} · </>}{e.deviceId} · {fmtDateTime(e.at)}{e.resolvedAt && ` → cleared ${fmtDateTime(e.resolvedAt)}`}</div>
              </div>
              <div className="actions">
                {e.ackBy ? <span className="small muted">Reviewed by {e.ackBy}</span>
                  : clin ? <button className="btn btn-sm" onClick={() => AlertStore.acknowledge(e.id, Auth.session.name)}>Mark reviewed</button>
                  : <span className="small muted">Awaiting clinician review</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
