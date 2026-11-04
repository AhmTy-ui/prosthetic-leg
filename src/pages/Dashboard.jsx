import { Auth, CONFIG, LiveHub, ZONES, pressureLevel, stateOf, timeAgo } from '../lib/data.js';
import { usePatient, useStore } from '../hooks.js';
import FootMap from '../components/FootMap.jsx';
import Icon from '../components/Icon.jsx';

const STATUS = {
  walking: { label: 'Walking', icon: 'walk' },
  standing: { label: 'Standing', icon: 'stand' },
  idle: { label: 'Resting', icon: 'rest' },
};

export default function Dashboard() {
  useStore();
  const { patient } = usePatient();
  const st = LiveHub.state[patient.deviceId] || {};
  const pk = st.latest;
  const online = !!st.online;
  const conds = st.conditions || [];

  // 10-second average balance (smoother than the per-second reading)
  const recent = (st.buffer || []).slice(-10).filter((p) => p.status !== 'idle');
  const heelAvg = recent.length ? Math.round(recent.reduce((a, p) => a + p.heel_percent, 0) / recent.length) : pk?.heel_percent ?? 0;
  const heel = pk ? pk.heel_percent : 0;
  const fore = pk ? pk.forefoot_percent : 0;

  const zoneStates = {};
  conds.forEach((c) => {
    if (c.zone) zoneStates[c.zone] = 'alert';
    if (c.region === 'heel') { zoneStates[1] ||= 'warn'; zoneStates[2] ||= 'warn'; }
    if (c.region === 'forefoot') [5, 6, 7, 8].forEach((z) => { zoneStates[z] ||= 'warn'; });
  });

  const heelCond = conds.find((c) => c.key === 'heel');
  const foreCond = conds.find((c) => c.key === 'fore');
  const tempS = stateOf('temp', pk?.temperature_c);
  const humS = stateOf('hum', pk?.humidity_percent);
  const battS = stateOf('batt', pk?.battery_percent);
  const status = STATUS[pk?.status] || { label: pk?.status || 'Unknown', icon: 'stand' };

  return (
    <>
      {!online && (
        <div className="offline-banner" role="alert">
          <Icon name="wifiOff" size={22} />
          <div>The shoe is offline. Last data received {timeAgo(st.lastSeen)}. Readings below show the last known values.</div>
        </div>
      )}

      <div className="dash">
        {/* Left cards */}
        <div className="dash-left stack">
          <div className="card">
            <div className="card-title"><Icon name="foot" />Heel load</div>
            <div className="metric num">{pk ? heel : '—'}<span className="unit">%</span></div>
            <div className="meter"><span style={{ width: `${heel}%`, background: '#7cc2bd' }} /></div>
            <div className="sub">{heelCond ? <span className="chip warn">High heel pressure</span> : `10 s average ${heelAvg}%`}</div>
          </div>
          <div className="card">
            <div className="card-title"><Icon name="foot" />Forefoot load</div>
            <div className="metric num">{pk ? fore : '—'}<span className="unit">%</span></div>
            <div className="meter"><span style={{ width: `${fore}%` }} /></div>
            <div className="sub">{foreCond ? <span className="chip warn">High forefoot pressure</span> : `10 s average ${100 - heelAvg}%`}</div>
          </div>
          <div className="card">
            <div className="card-title"><Icon name="steps" />Steps today</div>
            <div className="metric num">{pk ? pk.steps.toLocaleString() : '—'}</div>
            <div className="sub">Counted by the shoe</div>
          </div>
          <div className="card">
            <div className="card-title"><Icon name="walk" />Walking status</div>
            <div className="status-big"><span className="status-icon"><Icon name={status.icon} /></span>{online ? status.label : 'No signal'}</div>
          </div>
        </div>

        {/* Centre: heat map */}
        <div className="dash-center">
          <div className="card foot-card">
            <div className="card-head">
              <h2>Foot pressure map</h2>
              <span className="chip plain">{patient.side} foot · {online ? 'live' : 'last known'}</span>
            </div>
            <FootMap pressure={pk?.pressure} side={patient.side} zoneStates={zoneStates} dim={!online} />
            <div className="legend-scale"><span>Low</span><span className="bar" /><span>High</span></div>
            <div className="balance">
              <div className="card-title" style={{ marginBottom: 8 }}><Icon name="balance" />Pressure balance</div>
              <div className="balance-bar"><div className="heel" style={{ width: `${heel}%` }} /><div className="fore" style={{ width: `${fore}%` }} /></div>
              <div className="balance-labels"><span>Heel <b className="num">{heel}%</b></span><span>Forefoot <b className="num">{fore}%</b></span></div>
            </div>
          </div>
        </div>

        {/* Right cards */}
        <div className="dash-right stack">
          <div className="card">
            <div className="card-title"><Icon name="thermo" />Temperature in shoe</div>
            <div className="metric num">{pk?.temperature_c != null ? pk.temperature_c.toFixed(1) : '—'}<span className="unit">°C</span></div>
            <div className="sub"><span className={`chip ${tempS.cls}`}>{tempS.label}</span></div>
          </div>
          <div className="card">
            <div className="card-title"><Icon name="drop" />Humidity in shoe</div>
            <div className="metric num">{pk?.humidity_percent ?? '—'}<span className="unit">%</span></div>
            <div className="sub"><span className={`chip ${humS.cls}`}>{humS.label}</span></div>
          </div>
          <div className="card">
            <div className="card-title"><Icon name={online ? 'wifi' : 'wifiOff'} />Connection</div>
            <div className="metric" style={{ fontSize: 22 }}><span className={`chip ${online ? 'ok pulse' : 'alert'}`} style={{ fontSize: 14 }}>{online ? 'Online' : 'Offline'}</span></div>
            <div className="sub">{patient.deviceId} · updated {timeAgo(st.lastSeen)}</div>
          </div>
          <div className="card">
            <div className="card-title"><Icon name="battery" />Battery</div>
            <div className="metric num">{pk?.battery_percent ?? '—'}<span className="unit">%</span></div>
            <div className={`meter ${battS.cls}`}><span style={{ width: `${pk?.battery_percent ?? 0}%` }} /></div>
            <div className="sub"><span className={`chip ${battS.cls}`}>{battS.label}</span></div>
          </div>
        </div>

        {/* Observations in plain language */}
        <div className="dash-obs card">
          <div className="card-head"><h2>What the shoe is telling us</h2><span className="muted small">Updates every second</span></div>
          <ul className="obs-list">
            {conds.length === 0 && (
              <li className="ok"><span className="dot" /><div><div className="t">All readings look normal</div><div className="d">No pressure, heat, moisture or battery concerns right now.</div></div></li>
            )}
            {conds.map((c) => (
              <li key={c.key} className={c.severity === 'alert' ? 'alert' : 'warn'}><span className="dot" />
                <div><div className="t">{c.title}</div><div className="d">{c.detail}</div></div></li>
            ))}
          </ul>
          <div className="disclaimer"><Icon name="info" size={16} />These are device readings to support care conversations. They are not a medical diagnosis.</div>
          {Auth.isClinician() && LiveHub.mode !== 'connecting' && online !== undefined && <SimPanel deviceId={patient.deviceId} />}
        </div>

        {/* Zone levels */}
        <div className="dash-zones card">
          <div className="card-head"><h2>Pressure by zone</h2><span className="muted small">Relative to sensor range</span></div>
          <table className="zone-table">
            <tbody>
              {ZONES.map((z, i) => {
                const r = pk ? pk.pressure[i] / CONFIG.sensorMax : 0;
                return (
                  <tr key={z.id}>
                    <td className="zn">{z.id}</td>
                    <td>{z.name}</td>
                    <td className="zbar"><div className="mini-meter"><span style={{ width: `${Math.round(r * 100)}%`, background: zoneStates[z.id] === 'alert' ? 'var(--alert)' : undefined }} /></div></td>
                    <td className="zlvl">{pressureLevel(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* Clinician-only demo controls for the simulator (remove when the real ESP32 is connected) */
function SimPanel({ deviceId }) {
  if (deviceId === 'SHOE-003') return <div className="sim-panel muted">SHOE-003 is offline in this demo. Choose another patient to try the simulator controls.</div>;
  const b = (what, label) => <button className="btn btn-sm" onClick={() => LiveHub.simulate(deviceId, what)}>{label}</button>;
  return (
    <div className="sim-panel">
      <b>Simulator:</b>
      {b('highPressure', 'High pressure spot')}{b('heelHigh', 'High heel load')}{b('heat', 'Excess heat')}
      {b('moisture', 'Excess moisture')}{b('lowBattery', 'Low battery')}{b('offline', 'Go offline (15 s)')}
    </div>
  );
}
