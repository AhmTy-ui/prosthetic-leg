import { useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertStore, Auth, History as H, Notes, PATIENTS, fmtDateTime, ALERT_TYPES, dayKey } from '../lib/data.js';
import { usePatient } from '../hooks.js';
import { StepsChart, BalanceChart, historySeries } from './History.jsx';
import Icon from '../components/Icon.jsx';

const SECTIONS = [
  ['summary', 'Summary'], ['charts', 'Activity & balance charts'], ['table', 'Daily readings table'], ['alerts', 'Alerts in period'], ['notes', 'Clinician notes'],
];

export default function Reports() {
  const { patient: selected } = usePatient();
  const [pid, setPid] = useState(selected.id);
  const [period, setPeriod] = useState('week');
  const [inc, setInc] = useState({ summary: true, charts: true, table: true, alerts: true, notes: true });
  const [busy, setBusy] = useState(false);
  const previewRef = useRef(null);
  const patient = PATIENTS.find((p) => p.id === pid);

  const now = new Date();
  const s = useMemo(() => historySeries(pid, period === 'week' ? 'weekly' : 'daily', now), [pid, period]);
  const valid = s.rows.filter((r) => r.steps != null);
  const active = valid.filter((r) => r.steps > 30);
  const avg = (arr, k) => (arr.length ? arr.reduce((a, r) => a + r[k], 0) / arr.length : 0);
  const totalSteps = valid.reduce((a, r) => a + r.steps, 0);
  const heelAvg = Math.round(avg(active, 'heel'));
  const since = period === 'week' ? Date.now() - 7 * 86400000 : new Date(dayKey(now) + 'T00:00:00').getTime();
  const alerts = AlertStore.visible().filter((e) => e.patientId === pid && new Date(e.at).getTime() >= since);
  const notes = Notes.get(pid);
  const periodLabel = period === 'week'
    ? `${new Date(Date.now() - 6 * 86400000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const summaryRows = [
    ['Total steps', totalSteps.toLocaleString()],
    ...(period === 'week' ? [['Average steps per day', Math.round(totalSteps / 7).toLocaleString()]] : []),
    ['Average pressure balance', `${heelAvg}% heel / ${100 - heelAvg}% forefoot`],
    ['Average temperature in shoe', `${avg(valid, 'temp').toFixed(1)} °C (highest ${Math.max(...valid.map((r) => r.tempMax ?? r.temp)).toFixed(1)} °C)`],
    ['Average humidity in shoe', `${Math.round(avg(valid, 'hum'))}% (highest ${Math.max(...valid.map((r) => r.humMax ?? r.hum))}%)`],
    ['Alerts in period', `${alerts.length} (${alerts.filter((a) => a.severity === 'alert').length} alert, ${alerts.filter((a) => a.severity === 'warning').length} warning)`],
  ];
  const tableHead = [period === 'week' ? 'Day' : 'Hour', 'Steps', 'Heel %', 'Forefoot %', 'Temp °C', 'Humidity %'];
  const tableBody = valid.filter((r) => period === 'week' || r.steps > 0).map((r, i) => [period === 'week' ? r.label : `${String(r.hour).padStart(2, '0')}:00`, r.steps.toLocaleString(), r.steps > 30 ? r.heel : '—', r.steps > 30 ? r.fore : '—', r.temp.toFixed(1), r.hum]);

  function download() {
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(), M = 44;
      const teal = [15, 139, 141], text = [29, 39, 51], muted = [102, 115, 130];
      let y = M;
      doc.setFillColor(...teal); doc.rect(0, 0, W, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...text);
      doc.text('Prosthetic Shoe Activity Report', M, y + 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted);
      doc.text(`StrideSense · Generated ${new Date().toLocaleString()} by ${Auth.session.name}`, M, y + 30);
      y += 50;
      autoTable(doc, {
        startY: y, theme: 'plain', margin: { left: M, right: M }, styles: { fontSize: 10, cellPadding: 3, textColor: text },
        columnStyles: { 0: { textColor: muted, cellWidth: 110 }, 2: { textColor: muted, cellWidth: 100 } },
        body: [['Patient', patient.name, 'Device', patient.deviceId], ['Patient ID', patient.id, 'Prosthesis side', patient.side], ['Clinician', patient.clinician, 'Period', periodLabel]],
      });
      y = doc.lastAutoTable.finalY + 18;
      const heading = (t) => {
        if (y > 760) { doc.addPage(); y = M; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...teal); doc.text(t, M, y); y += 8;
      };
      if (inc.summary) {
        heading('Summary');
        autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'striped', headStyles: { fillColor: teal }, styles: { fontSize: 10 },
          alternateRowStyles: { fillColor: [244, 248, 249] }, body: summaryRows, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 190 } } });
        y = doc.lastAutoTable.finalY + 22;
      }
      if (inc.charts) {
        const canvases = previewRef.current?.querySelectorAll('canvas') || [];
        const cw = (W - 2 * M - 16) / 2, ch = cw * 0.62;
        if (y + ch + 30 > 800) { doc.addPage(); y = M; }
        heading('Activity and pressure balance');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
        doc.text(period === 'week' ? 'Steps per day' : 'Steps per hour', M, y + 8); doc.text('Heel vs forefoot balance (%)', M + cw + 16, y + 8);
        canvases.forEach((c, i) => { if (i < 2) doc.addImage(c.toDataURL('image/png', 1), 'PNG', M + i * (cw + 16), y + 14, cw, ch); });
        y += ch + 34;
      }
      if (inc.table) {
        heading(period === 'week' ? 'Daily readings' : 'Hourly readings');
        autoTable(doc, { startY: y, margin: { left: M, right: M }, head: [tableHead], body: tableBody, theme: 'striped', headStyles: { fillColor: teal }, styles: { fontSize: 9 }, alternateRowStyles: { fillColor: [244, 248, 249] } });
        y = doc.lastAutoTable.finalY + 22;
      }
      if (inc.alerts) {
        heading('Alerts in period');
        autoTable(doc, { startY: y, margin: { left: M, right: M }, head: [['Date', 'Type', 'Level', 'Event', 'Reviewed']],
          body: alerts.length ? alerts.map((a) => [fmtDateTime(a.at), ALERT_TYPES[a.type], a.severity === 'alert' ? 'Alert' : 'Warning', a.title, a.ackBy ? 'Yes' : 'No']) : [['—', '', '', 'No alerts in this period', '']],
          theme: 'striped', headStyles: { fillColor: teal }, styles: { fontSize: 9 }, alternateRowStyles: { fillColor: [244, 248, 249] } });
        y = doc.lastAutoTable.finalY + 22;
      }
      if (inc.notes) {
        heading('Clinician notes');
        autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'plain', styles: { fontSize: 10, cellPadding: 4 },
          body: notes.length ? notes.slice(0, 8).map((n) => [`${fmtDateTime(n.at)}\n${n.by}`, n.text]) : [['', 'No notes.']], columnStyles: { 0: { cellWidth: 110, textColor: muted } } });
      }
      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
        doc.text('Device readings show relative pressure and are not a medical diagnosis. Confidential health information.', M, 820);
        doc.text(`Page ${i} of ${pages}`, W - M, 820, { align: 'right' });
      }
      doc.save(`StrideSense_${patient.id}_${period}_${dayKey(now)}.pdf`);
    } finally { setBusy(false); }
  }

  return (
    <div className="report-grid">
      <div className="card">
        <div className="card-head"><h2>Create report</h2></div>
        <div className="field"><label htmlFor="rp">Patient</label>
          <select id="rp" className="input" value={pid} onChange={(e) => setPid(e.target.value)}>{Auth.patients().map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></div>
        <div className="field"><label htmlFor="rper">Period</label>
          <select id="rper" className="input" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="week">Last 7 days</option><option value="day">Today</option></select></div>
        <div className="field"><label>Include</label>
          {SECTIONS.map(([k, v]) => (
            <label className="check" key={k}><input type="checkbox" checked={inc[k]} onChange={(e) => setInc({ ...inc, [k]: e.target.checked })} />{v}</label>
          ))}</div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={download} disabled={busy}><Icon name="download" size={18} />{busy ? 'Preparing…' : 'Download PDF'}</button>
      </div>

      <div className="card" ref={previewRef}>
        <div className="preview-head">
          <div><h2>Prosthetic Shoe Activity Report</h2><div className="muted small">{periodLabel}</div></div>
          <div className="small" style={{ textAlign: 'right' }}><b>{patient.name}</b><br /><span className="muted">{patient.id} · {patient.deviceId}</span></div>
        </div>
        {inc.summary && <table className="data-table" style={{ marginBottom: 20 }}><tbody>{summaryRows.map(([k, v]) => <tr key={k}><th style={{ width: '45%' }}>{k}</th><td>{v}</td></tr>)}</tbody></table>}
        {inc.charts && (
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div><div className="card-title" style={{ marginBottom: 6 }}>Steps</div><div className="chart-box" style={{ height: 200 }}><StepsChart s={s} animate={false} /></div></div>
            <div><div className="card-title" style={{ marginBottom: 6 }}>Pressure balance</div><div className="chart-box" style={{ height: 200 }}><BalanceChart s={s} animate={false} /></div></div>
          </div>
        )}
        {inc.table && (
          <div className="table-scroll" style={{ marginBottom: 20 }}>
            <table className="data-table"><thead><tr>{tableHead.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{tableBody.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="num">{c}</td>)}</tr>)}</tbody></table>
          </div>
        )}
        {inc.alerts && <p className="small"><b>Alerts in period:</b> {alerts.length ? alerts.slice(0, 6).map((a) => a.title).join(' · ') + (alerts.length > 6 ? ' …' : '') : 'none'}</p>}
        {inc.notes && <p className="small"><b>Latest note:</b> {notes[0]?.text || 'none'}</p>}
        <div className="disclaimer"><Icon name="info" size={16} />Device readings show relative pressure and are not a medical diagnosis.</div>
      </div>
    </div>
  );
}
