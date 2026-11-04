/* Client data layer: auth, live WebSocket feed, alert engine, history, notes.
   Falls back to an in-browser simulator if the Node backend is not running. */
import { CONFIG, ZONES, PATIENTS, normalizePacket, createFleet, mulberry32, hashStr, clamp, gauss, round1, dayKey } from './shared.js';

export { CONFIG, ZONES, PATIENTS };

/* ---------------- Tiny reactive store ---------------- */
const listeners = new Set();
let version = 0;
export const store = {
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getVersion() { return version; },
};
function notify() { version++; listeners.forEach((fn) => fn()); }

/* ---------------- Auth & role-based access ----------------
   The backend issues a session token and filters the live stream by role.
   The same rules are applied here so the UI never shows other patients' data. */
const DEMO_USERS = [
  { username: 'patient', password: 'patient123', role: 'patient', name: 'Daniel Mensah', patientId: 'P-1001' },
  { username: 'grace', password: 'patient123', role: 'patient', name: 'Grace Adeyemi', patientId: 'P-1002' },
  { username: 'clinician', password: 'clinic123', role: 'clinician', name: 'Dr. A. Bello', patientId: null },
];
const SKEY = 'ps_session_v2';
export const Auth = {
  session: (() => { try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch { return null; } })(),
  async login(username, password, role) {
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, role }) });
      if (r.status >= 500 || !(r.headers.get('content-type') || '').includes('json')) throw new Error('backend unavailable');
      const body = await r.json();
      if (!r.ok) return { ok: false, error: body.error };
      this.setSession({ ...body.user, token: body.token, demo: false });
      return { ok: true };
    } catch {
      // Backend not reachable: offline demo mode (client-side only)
      const u = DEMO_USERS.find((x) => x.username === username.trim().toLowerCase() && x.password === password);
      if (!u) return { ok: false, error: 'Incorrect username or password.' };
      if (u.role !== role) return { ok: false, error: `This account is not a ${role} account. Switch the tab above.` };
      this.setSession({ username: u.username, role: u.role, name: u.name, patientId: u.patientId, token: null, demo: true });
      return { ok: true };
    }
  },
  setSession(s) {
    this.session = s;
    try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* ignore */ }
    LiveHub.restart();
    notify();
  },
  async logout() {
    if (this.session?.token) fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${this.session.token}` } }).catch(() => {});
    this.session = null;
    try { sessionStorage.removeItem(SKEY); sessionStorage.removeItem('ps_selected'); } catch { /* ignore */ }
    LiveHub.stop();
    notify();
  },
  isClinician() { return this.session?.role === 'clinician'; },
  canAccessPatient(pid) { return !!this.session && (this.session.role === 'clinician' || this.session.patientId === pid); },
  patients() { return PATIENTS.filter((p) => this.canAccessPatient(p.id)); },
};

/* ---------------- Alert store ---------------- */
export const ALERT_TYPES = { pressure: 'Pressure', heat: 'Heat', moisture: 'Moisture', offline: 'Device offline', battery: 'Battery' };
const AKEY = 'ps_alerts_v2';
export const AlertStore = {
  events: [],
  load() {
    try { this.events = JSON.parse(localStorage.getItem(AKEY) || 'null') || []; } catch { this.events = []; }
    if (!this.events.length) this.events = seedAlertHistory();
    this.events.forEach((e) => { if (!e.resolvedAt && e.live) e.resolvedAt = e.at; }); // live engine re-raises if still true
  },
  save() { try { localStorage.setItem(AKEY, JSON.stringify(this.events.slice(0, 400))); } catch { /* ignore */ } },
  add(e) { this.events.unshift(e); this.save(); toast(e); },
  resolve(id) { const e = this.events.find((x) => x.id === id); if (e && !e.resolvedAt) { e.resolvedAt = new Date().toISOString(); this.save(); } },
  acknowledge(id, by) { const e = this.events.find((x) => x.id === id); if (e) { e.ackBy = by; e.ackAt = new Date().toISOString(); this.save(); notify(); } },
  visible() { return this.events.filter((e) => Auth.canAccessPatient(e.patientId)); },
};

function seedAlertHistory() {
  const out = [];
  const now = Date.now();
  const templates = [
    { type: 'pressure', severity: 'alert', title: 'High pressure at Ball of foot, inner', detail: 'Pressure stayed high in one area for several seconds.' },
    { type: 'pressure', severity: 'warning', title: 'High heel pressure', detail: 'More weight than usual was on the heel while walking.' },
    { type: 'heat', severity: 'warning', title: 'Shoe temperature rising', detail: 'Temperature inside the shoe was warmer than usual.' },
    { type: 'moisture', severity: 'warning', title: 'Moisture rising', detail: 'Humidity inside the shoe was higher than usual.' },
    { type: 'offline', severity: 'alert', title: 'Device offline', detail: 'No data received from the shoe.' },
    { type: 'battery', severity: 'warning', title: 'Low battery', detail: 'Battery is below 20%. Please charge the shoe.' },
  ];
  PATIENTS.forEach((pt) => {
    const rnd = mulberry32(hashStr(pt.id + 'alerts'));
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const t = templates[Math.floor(rnd() * templates.length)];
      const at = now - (1 + rnd() * 6.5) * 86400000;
      out.push({ id: `seed-${pt.id}-${i}`, patientId: pt.id, deviceId: pt.deviceId, ...t, at: new Date(at).toISOString(),
        resolvedAt: new Date(at + (5 + rnd() * 40) * 60000).toISOString(), ackBy: rnd() < 0.7 ? 'Dr. A. Bello' : null });
    }
  });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------------- Toasts (new live alerts) ---------------- */
export const toasts = [];
function toast(e) {
  if (!Auth.canAccessPatient(e.patientId)) return;
  if (Date.now() - new Date(e.at).getTime() > 30000) return; // only pop up for genuinely new events
  const t ={ id: e.id, title: e.title, detail: PATIENTS.find((p) => p.id === e.patientId)?.name + ' · ' + e.detail, severity: e.severity };
  toasts.push(t);
  setTimeout(() => { const i = toasts.indexOf(t); if (i >= 0) { toasts.splice(i, 1); notify(); } }, 6000);
}

/* ---------------- Alert engine ---------------- */
function conditionsFor(st) {
  const T = CONFIG.thresholds;
  const conds = [];
  if (!st.online) {
    conds.push({ key: 'offline', type: 'offline', severity: 'alert', title: 'Device offline', detail: 'No data received from the shoe for more than 10 seconds.' });
    return conds;
  }
  const buf = st.buffer, last = buf[buf.length - 1];
  if (!last) return conds;
  const n = T.zoneHighSeconds;
  if (buf.length >= n) {
    for (let z = 0; z < 10; z++) {
      if (buf.slice(-n).every((pk) => pk.pressure[z] / CONFIG.sensorMax >= T.zoneHigh)) {
        conds.push({ key: `zone${z + 1}`, type: 'pressure', severity: 'alert', title: `High pressure at ${ZONES[z].name}`, detail: 'Pressure has stayed high in this area for several seconds.', zone: z + 1 });
      }
    }
  }
  const onFoot = buf.slice(-10).filter((pk) => pk.status !== 'idle');
  if (onFoot.length >= 6) {
    const heelAvg = onFoot.reduce((a, pk) => a + pk.heel_percent, 0) / onFoot.length;
    if (heelAvg >= T.heelHighPct) conds.push({ key: 'heel', type: 'pressure', severity: 'warning', title: 'High heel pressure', detail: 'More weight than usual is on the heel.', region: 'heel' });
    if (100 - heelAvg >= T.forefootHighPct) conds.push({ key: 'fore', type: 'pressure', severity: 'warning', title: 'High forefoot pressure', detail: 'More weight than usual is on the front of the foot.', region: 'forefoot' });
  }
  if (last.temperature_c != null) {
    if (last.temperature_c >= T.tempAlert) conds.push({ key: 'heat', type: 'heat', severity: 'alert', title: 'Excess heat in shoe', detail: 'Temperature inside the shoe is high. Consider taking the shoe off to cool down.' });
    else if (last.temperature_c >= T.tempWarn) conds.push({ key: 'heat', type: 'heat', severity: 'warning', title: 'Shoe temperature rising', detail: 'Temperature inside the shoe is warmer than usual.' });
  }
  if (last.humidity_percent != null) {
    if (last.humidity_percent >= T.humAlert) conds.push({ key: 'moist', type: 'moisture', severity: 'alert', title: 'Excess moisture in shoe', detail: 'Humidity inside the shoe is high. Consider drying the liner.' });
    else if (last.humidity_percent >= T.humWarn) conds.push({ key: 'moist', type: 'moisture', severity: 'warning', title: 'Moisture rising', detail: 'Humidity inside the shoe is higher than usual.' });
  }
  if (last.battery_percent != null) {
    if (last.battery_percent <= T.batteryAlert) conds.push({ key: 'batt', type: 'battery', severity: 'alert', title: 'Battery very low', detail: 'Battery is below 10%. Please charge the shoe soon.' });
    else if (last.battery_percent <= T.batteryWarn) conds.push({ key: 'batt', type: 'battery', severity: 'warning', title: 'Low battery', detail: 'Battery is below 20%. Please charge the shoe.' });
  }
  return conds;
}

const activeConds = {}; // deviceId -> { key: {id, sig} }
function evaluate(deviceId) {
  const pt = PATIENTS.find((p) => p.deviceId === deviceId);
  const st = LiveHub.state[deviceId];
  if (!pt || !st) return;
  const conds = conditionsFor(st);
  st.conditions = conds;
  const act = (activeConds[deviceId] = activeConds[deviceId] || {});
  const seen = new Set();
  conds.forEach((c) => {
    const sig = `${c.key}:${c.severity}`;
    seen.add(c.key);
    if (act[c.key]?.sig === sig) return;
    if (act[c.key]) AlertStore.resolve(act[c.key].id);
    const open = AlertStore.events.find((e) => e.deviceId === deviceId && !e.resolvedAt && e.conditionKey === c.key && e.severity === c.severity);
    if (open) { act[c.key] = { id: open.id, sig }; return; }
    const id = `${deviceId}-${c.key}-${Date.now()}`;
    // For a device that was already offline when we connected, date the event from its last contact
    const at = c.key === 'offline' && st.lastSeen ? new Date(st.lastSeen + CONFIG.offlineAfterMs).toISOString() : new Date().toISOString();
    AlertStore.add({ id, patientId: pt.id, deviceId, type: c.type, severity: c.severity, title: c.title, detail: c.detail,
      at, resolvedAt: null, ackBy: null, conditionKey: c.key, live: true });
    act[c.key] = { id, sig };
  });
  Object.keys(act).forEach((k) => { if (!seen.has(k)) { AlertStore.resolve(act[k].id); delete act[k]; } });
}

/* ---------------- Live hub ---------------- */
export const LiveHub = {
  state: {},          // deviceId -> { latest, buffer[], lastSeen, online, conditions[] }
  mode: 'connecting', // 'live' (backend WebSocket) | 'local' (in-browser simulator) | 'connecting'
  ws: null, localTimer: null, fleet: null, stopped: true,
  init() {
    AlertStore.load();
    setInterval(() => this.checkOnline(), 1000);
    if (Auth.session) this.restart();
  },
  resetState() {
    this.state = {};
    PATIENTS.forEach((p) => { this.state[p.deviceId] = { latest: null, buffer: [], lastSeen: null, online: false, conditions: [] }; });
  },
  restart() {
    this.stop();
    this.stopped = false;
    this.resetState();
    const s = Auth.session;
    if (!s) return;
    if (s.demo || !s.token) this.startLocal();
    else this.connect();
  },
  stop() {
    this.stopped = true;
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    clearInterval(this.localTimer); this.localTimer = null;
  },
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.mode = 'connecting';
    const ws = (this.ws = new WebSocket(`${proto}://${location.host}/live?token=${encodeURIComponent(Auth.session.token)}`));
    let opened = false;
    ws.onopen = () => { opened = true; this.mode = 'live'; notify(); };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'snapshot') {
        msg.devices.forEach((d) => {
          const st = this.state[d.deviceId]; if (!st || !d.packet) return;
          st.latest = normalizePacket(d.packet); st.lastSeen = d.lastSeen;
          st.online = Date.now() - d.lastSeen < CONFIG.offlineAfterMs;
        });
        notify();
      } else if (msg.type === 'packet') this.ingest(msg.data);
    };
    ws.onclose = () => {
      if (this.stopped) return;
      if (!opened) { // token expired or backend down
        fetch('/api/me', { headers: { Authorization: `Bearer ${Auth.session?.token}` } })
          .then((r) => { if (r.status === 401) Auth.logout(); else setTimeout(() => !this.stopped && this.connect(), 3000); })
          .catch(() => setTimeout(() => !this.stopped && this.connect(), 3000));
      } else setTimeout(() => !this.stopped && this.connect(), 2000);
      this.mode = 'connecting'; notify();
    };
  },
  startLocal() {
    this.mode = 'local';
    this.fleet = createFleet();
    Object.entries(this.fleet.lastKnown).forEach(([id, v]) => {
      if (!Auth.canAccessPatient(PATIENTS.find((p) => p.deviceId === id)?.id)) return;
      this.state[id].latest = normalizePacket(v.packet); this.state[id].lastSeen = v.lastSeen;
    });
    this.localTimer = setInterval(() => {
      Object.values(this.fleet.sims).forEach((sim) => {
        const pt = PATIENTS.find((p) => p.deviceId === sim.deviceId);
        if (!Auth.canAccessPatient(pt.id)) return; // same rule as backend
        const pk = sim.tick(); if (pk) this.ingest(pk);
      });
    }, CONFIG.updateIntervalMs);
  },
  ingest(raw) {
    const pk = normalizePacket(raw);
    const st = pk && this.state[pk.device_id];
    if (!st) return;
    const pt = PATIENTS.find((p) => p.deviceId === pk.device_id);
    if (!Auth.canAccessPatient(pt.id)) return;
    st.latest = pk; st.lastSeen = Date.now(); st.online = true;
    st.buffer.push(pk); if (st.buffer.length > 60) st.buffer.shift();
    evaluate(pk.device_id);
    notify();
  },
  checkOnline() {
    if (!Auth.session || this.stopped) return;
    let changed = false;
    Object.entries(this.state).forEach(([id, st]) => {
      const pt = PATIENTS.find((p) => p.deviceId === id);
      if (!Auth.canAccessPatient(pt.id) || st.lastSeen == null) return;
      const was = st.online;
      st.online = Date.now() - st.lastSeen < CONFIG.offlineAfterMs;
      if (!st.online) { evaluate(id); changed = true; }
      if (was !== st.online) changed = true;
    });
    if (changed || this.mode !== 'connecting') notify(); // keeps "updated x s ago" fresh
  },
  simulate(deviceId, what) {
    if (!Auth.isClinician()) return;
    if (this.mode === 'local') this.fleet?.sims[deviceId]?.trigger(what);
    else if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'simulate', deviceId, what }));
  },
};

/* ---------------- History (simulated, deterministic per patient/day) ---------------- */
function hourlyActivityCurve(h) {
  if (h < 6 || h >= 23) return 0.02;
  return 0.25 + 0.9 * gauss(h, 9.5, 2.2) + 0.7 * gauss(h, 13, 1.5) + 0.95 * gauss(h, 17.5, 2.2);
}
export const History = {
  daily(patientId, date) {
    if (!Auth.canAccessPatient(patientId)) return [];
    const pt = PATIENTS.find((p) => p.id === patientId);
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const rnd = mulberry32(hashStr(patientId + dayKey(d)));
    const now = new Date();
    const isToday = dayKey(d) === dayKey(now);
    const offlineCut = pt.deviceId === 'SHOE-003' ? now.getHours() - 2 : 99;
    const dayFactor = 0.75 + rnd() * 0.5;
    const heelBase = (30 * pt.profile.heel) / pt.profile.fore + (rnd() - 0.5) * 10;
    const hours = [];
    for (let h = 0; h < 24; h++) {
      if (isToday && (h > now.getHours() || h > offlineCut)) { hours.push({ hour: h, steps: null, heel: null, fore: null, temp: null, hum: null }); continue; }
      const act = hourlyActivityCurve(h) * dayFactor;
      const steps = Math.round(act * (420 + rnd() * 260));
      const heel = Math.round(clamp(heelBase + (rnd() - 0.5) * 8, 10, 70));
      hours.push({ hour: h, steps, heel, fore: 100 - heel, temp: round1(29.8 + act * 2.6 + (rnd() - 0.5) * 0.6), hum: Math.round(55 + act * 9 + (rnd() - 0.5) * 6) });
    }
    return hours;
  },
  weekly(patientId, endDate = new Date()) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(endDate); d.setDate(d.getDate() - i); d.setHours(12, 0, 0, 0);
      const hrs = this.daily(patientId, d).filter((x) => x.steps != null);
      const active = hrs.filter((x) => x.steps > 30);
      const avg = (arr, k) => (arr.length ? arr.reduce((a, x) => a + x[k], 0) / arr.length : null);
      const heel = Math.round(avg(active, 'heel') ?? 0);
      days.push({
        date: d, label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
        steps: hrs.reduce((a, x) => a + x.steps, 0), heel, fore: 100 - heel,
        temp: round1(avg(hrs, 'temp') ?? 0), tempMax: hrs.length ? Math.max(...hrs.map((x) => x.temp)) : null,
        hum: Math.round(avg(hrs, 'hum') ?? 0), humMax: hrs.length ? Math.max(...hrs.map((x) => x.hum)) : null,
      });
    }
    return days;
  },
};

/* ---------------- Clinician notes ---------------- */
const DEFAULT_NOTES = {
  'P-1001': [{ at: '2026-10-28T10:15:00Z', by: 'Dr. A. Bello', text: 'Socket fit reviewed. Encourage gradual increase in daily walking. Recheck insole wear at next visit.' }],
  'P-1002': [{ at: '2026-10-30T09:00:00Z', by: 'Dr. A. Bello', text: 'Tends to load the front of the foot. Gait training session booked for next week.' }],
  'P-1003': [{ at: '2026-10-21T14:40:00Z', by: 'Dr. A. Bello', text: 'New fitting. Device charging routine explained to patient.' }],
};
const NKEY = 'ps_notes_v2';
export const Notes = {
  all() { try { return JSON.parse(localStorage.getItem(NKEY) || 'null') || structuredClone(DEFAULT_NOTES); } catch { return structuredClone(DEFAULT_NOTES); } },
  get(pid) { return Auth.canAccessPatient(pid) ? this.all()[pid] || [] : []; },
  add(pid, text) {
    if (!Auth.isClinician()) return;
    const a = this.all();
    (a[pid] = a[pid] || []).unshift({ at: new Date().toISOString(), by: Auth.session.name, text });
    try { localStorage.setItem(NKEY, JSON.stringify(a)); } catch { /* ignore */ }
    notify();
  },
};

/* ---------------- Plain-language helpers ---------------- */
export function pressureLevel(rel) {
  if (rel < 0.25) return 'Low';
  if (rel < 0.6) return 'Moderate';
  if (rel < CONFIG.thresholds.zoneHigh) return 'High';
  return 'Very high';
}
export function stateOf(kind, v) {
  const T = CONFIG.thresholds;
  if (v == null) return { cls: '', label: 'No data' };
  if (kind === 'temp') return v >= T.tempAlert ? { cls: 'alert', label: 'Too warm' } : v >= T.tempWarn ? { cls: 'warn', label: 'Warm' } : { cls: 'ok', label: 'Normal' };
  if (kind === 'hum') return v >= T.humAlert ? { cls: 'alert', label: 'Too damp' } : v >= T.humWarn ? { cls: 'warn', label: 'Damp' } : { cls: 'ok', label: 'Normal' };
  if (kind === 'batt') return v <= T.batteryAlert ? { cls: 'alert', label: 'Charge now' } : v <= T.batteryWarn ? { cls: 'warn', label: 'Low' } : { cls: 'ok', label: 'Good' };
  return { cls: '', label: '' };
}
export function timeAgo(ms) {
  if (ms == null) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export { dayKey };
