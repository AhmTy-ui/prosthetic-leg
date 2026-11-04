import { useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { History as H, dayKey } from '../lib/data.js';
import { usePatient } from '../hooks.js';
import Icon from '../components/Icon.jsx';

export const COLORS = { accent: '#0f8b8d', accentLight: '#7cc2bd', accentDark: '#0a6e70', slate: '#64748b' };

export function historySeries(patientId, mode, date) {
  if (mode === 'daily') {
    const rows = H.daily(patientId, date);
    return { labels: rows.map((r) => `${String(r.hour).padStart(2, '0')}:00`), rows };
  }
  const rows = H.weekly(patientId, date);
  return { labels: rows.map((r) => r.label), rows };
}

const baseOpts = (extra = {}) => ({
  responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { beginAtZero: true, border: { display: false } } },
  ...extra,
});

export function StepsChart({ s, animate = true }) {
  return <Bar data={{ labels: s.labels, datasets: [{ label: 'Steps', data: s.rows.map((r) => r.steps), backgroundColor: COLORS.accent, borderRadius: 4, maxBarThickness: 28 }] }}
    options={{ ...baseOpts(), animation: animate ? { duration: 300 } : false }} />;
}
export function BalanceChart({ s, animate = true }) {
  return <Bar data={{ labels: s.labels, datasets: [
    { label: 'Heel %', data: s.rows.map((r) => (r.steps > 30 ? r.heel : null)), backgroundColor: COLORS.accentLight, stack: 'b', maxBarThickness: 28 },
    { label: 'Forefoot %', data: s.rows.map((r) => (r.steps > 30 ? r.fore : null)), backgroundColor: COLORS.accentDark, stack: 'b', maxBarThickness: 28 },
  ] }} options={baseOpts({ animation: animate ? { duration: 300 } : false, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } } },
    scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12 } }, y: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } } } })} />;
}
function LineChart({ s, field, label, unit, color, min, max }) {
  return <Line data={{ labels: s.labels, datasets: [{ label, data: s.rows.map((r) => r[field]), borderColor: color, backgroundColor: color + '22', fill: true, tension: 0.35, pointRadius: 2, spanGaps: false }] }}
    options={baseOpts({ scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12 } }, y: { min, max, ticks: { callback: (v) => `${v}${unit}` } } } })} />;
}

export default function History() {
  const { patient } = usePatient();
  const [mode, setMode] = useState('daily');
  const [date, setDate] = useState(dayKey(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d; }), []);
  const s = useMemo(() => historySeries(patient.id, mode, new Date(date + 'T12:00:00')), [patient.id, mode, date]);
  const valid = s.rows.filter((r) => r.steps != null);
  const active = valid.filter((r) => r.steps > 30);
  const totalSteps = valid.reduce((a, r) => a + r.steps, 0);
  const avg = (arr, k) => (arr.length ? arr.reduce((a, r) => a + r[k], 0) / arr.length : 0);
  const heelAvg = Math.round(avg(active, 'heel'));

  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}>Daily</button>
          <button className={mode === 'weekly' ? 'active' : ''} onClick={() => setMode('weekly')}>Weekly</button>
        </div>
        {mode === 'daily' ? (
          <select className="input" style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day">
            {days.map((d, i) => <option key={i} value={dayKey(d)}>{i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</option>)}
          </select>
        ) : <span className="muted small">Last 7 days</span>}
        <span className="muted small" style={{ marginLeft: 'auto' }}>{patient.name} · {patient.deviceId}</span>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat-mini"><div className="card-title"><Icon name="steps" />{mode === 'daily' ? 'Steps' : 'Total steps'}</div><div className="metric num">{totalSteps.toLocaleString()}</div>
          {mode === 'weekly' && <div className="sub">About {Math.round(totalSteps / 7).toLocaleString()} a day</div>}</div>
        <div className="card stat-mini"><div className="card-title"><Icon name="balance" />Average balance</div><div className="metric num">{heelAvg}<span className="unit">% heel</span></div><div className="sub">{100 - heelAvg}% forefoot</div></div>
        <div className="card stat-mini"><div className="card-title"><Icon name="thermo" />Average temperature</div><div className="metric num">{avg(valid, 'temp').toFixed(1)}<span className="unit">°C</span></div></div>
        <div className="card stat-mini"><div className="card-title"><Icon name="drop" />Average humidity</div><div className="metric num">{Math.round(avg(valid, 'hum'))}<span className="unit">%</span></div></div>
      </div>

      <div className="grid-2">
        <div className="card"><div className="card-head"><h2>Steps</h2><span className="muted small">{mode === 'daily' ? 'per hour' : 'per day'}</span></div><div className="chart-box"><StepsChart s={s} /></div></div>
        <div className="card"><div className="card-head"><h2>Pressure balance</h2><span className="muted small">heel vs forefoot, while active</span></div><div className="chart-box"><BalanceChart s={s} /></div></div>
        <div className="card"><div className="card-head"><h2>Temperature in shoe</h2><span className="muted small">average</span></div><div className="chart-box"><LineChart s={s} field="temp" label="Temperature" unit="°" color={COLORS.accent} min={26} max={40} /></div></div>
        <div className="card"><div className="card-head"><h2>Humidity in shoe</h2><span className="muted small">average</span></div><div className="chart-box"><LineChart s={s} field="hum" label="Humidity" unit="%" color={COLORS.slate} min={30} max={100} /></div></div>
      </div>
    </>
  );
}
