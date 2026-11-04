/* Shared between the Node.js backend and the React frontend:
   config, foot zones, demo patients, packet normalisation and the ESP32 simulator. */

export const CONFIG = {
  updateIntervalMs: 1000,
  offlineAfterMs: 10000,
  sensorMax: 4095,
  thresholds: {
    zoneHigh: 0.85,          // relative pressure (share of sensor range) considered high
    zoneHighSeconds: 3,      // sustained for N packets
    heelHighPct: 65,         // 10 s average heel load
    forefootHighPct: 88,     // 10 s average forefoot load
    tempWarn: 35, tempAlert: 37,
    humWarn: 75, humAlert: 85,
    batteryWarn: 20, batteryAlert: 10,
  },
};

/* Sensor order exactly as in the brief (array index 0 = sensor 1) */
export const ZONES = [
  { id: 1, name: 'Inner heel', region: 'heel' },
  { id: 2, name: 'Outer heel', region: 'heel' },
  { id: 3, name: 'Inner midfoot', region: 'midfoot' },
  { id: 4, name: 'Outer midfoot', region: 'midfoot' },
  { id: 5, name: 'Ball of foot, inner', region: 'forefoot' },
  { id: 6, name: 'Ball, inner-middle', region: 'forefoot' },
  { id: 7, name: 'Ball, outer-middle', region: 'forefoot' },
  { id: 8, name: 'Ball of foot, outer', region: 'forefoot' },
  { id: 9, name: 'Big toe', region: 'forefoot' },
  { id: 10, name: 'Other toes', region: 'forefoot' },
];

/* Demo patient records (would come from PostgreSQL in production) */
export const PATIENTS = [
  { id: 'P-1001', name: 'Daniel Mensah', deviceId: 'SHOE-001', side: 'Right', dob: '1984-03-12',
    clinician: 'Dr. A. Bello', fittedOn: '2026-08-18', firmware: '0.9.2', profile: { heel: 1.0, fore: 1.0 } },
  { id: 'P-1002', name: 'Grace Adeyemi', deviceId: 'SHOE-002', side: 'Left', dob: '1991-07-25',
    clinician: 'Dr. A. Bello', fittedOn: '2026-09-02', firmware: '0.9.2', profile: { heel: 0.75, fore: 1.15 } },
  { id: 'P-1003', name: 'Samuel Eze', deviceId: 'SHOE-003', side: 'Right', dob: '1976-11-30',
    clinician: 'Dr. A. Bello', fittedOn: '2026-10-10', firmware: '0.9.1', profile: { heel: 1.2, fore: 0.9 } },
];

/* ---------- Utilities ---------- */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
export const round1 = (v) => Math.round(v * 10) / 10;
export function dayKey(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }

/* Normalise an incoming packet. Tolerant of firmware format changes:
   missing fields are derived or defaulted instead of breaking the UI. */
export function normalizePacket(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pressure = Array.isArray(raw.pressure) ? raw.pressure.slice(0, 10).map((v) => clamp(Number(v) || 0, 0, CONFIG.sensorMax)) : new Array(10).fill(0);
  while (pressure.length < 10) pressure.push(0);
  let heel = Number(raw.heel_percent), fore = Number(raw.forefoot_percent);
  if (!Number.isFinite(heel) || !Number.isFinite(fore)) {
    const h = pressure[0] + pressure[1] + 0.5 * (pressure[2] + pressure[3]);
    const f = pressure.slice(4).reduce((a, b) => a + b, 0) + 0.5 * (pressure[2] + pressure[3]);
    const t = h + f;
    heel = t > 0 ? Math.round((h / t) * 100) : 0; fore = t > 0 ? 100 - heel : 0;
  }
  return {
    device_id: String(raw.device_id || 'UNKNOWN'),
    timestamp: raw.timestamp || new Date().toISOString(),
    pressure,
    heel_percent: heel,
    forefoot_percent: fore,
    steps: Number(raw.steps) || 0,
    temperature_c: raw.temperature_c != null ? Number(raw.temperature_c) : null,
    humidity_percent: raw.humidity_percent != null ? Number(raw.humidity_percent) : null,
    battery_percent: raw.battery_percent != null ? Number(raw.battery_percent) : null,
    status: String(raw.status || 'unknown').toLowerCase(),
  };
}

/* ---------- ESP32 simulator (produces the brief's JSON, 1 packet/s) ---------- */
const ZONE_MAX = [3000, 2800, 900, 1500, 3200, 3000, 2600, 2000, 2400, 1200];
const ZONE_STAND = [1500, 1350, 300, 650, 1100, 1000, 850, 600, 450, 250];
export const SIM_EPISODES = { highPressure: 8, heelHigh: 14, heat: 40, moisture: 40, offline: 15, lowBattery: 20 };

export class DeviceSimulator {
  constructor(patient, opts = {}) {
    this.deviceId = patient.deviceId;
    this.profile = patient.profile;
    this.rand = mulberry32(hashStr(patient.deviceId) + (Date.now() % 1000));
    this.steps = opts.steps ?? 1200;
    this.temp = opts.temp ?? 31.2;
    this.hum = opts.hum ?? 62;
    this.battery = opts.battery ?? 87;
    this.status = 'walking';
    this.statusLeft = 40;
    this.phase = 0;
    this.offline = !!opts.offline;
    this.episodes = {};
    this.tickCount = 0;
  }
  trigger(name) { if (SIM_EPISODES[name]) this.episodes[name] = SIM_EPISODES[name]; }
  nextStatus() {
    const r = this.rand();
    if (this.status === 'walking') this.status = r < 0.6 ? 'standing' : 'idle';
    else this.status = r < 0.75 ? 'walking' : (this.status === 'idle' ? 'standing' : 'idle');
    this.statusLeft = this.status === 'walking' ? 45 + this.rand() * 120 : 15 + this.rand() * 45;
  }
  tick() {
    this.tickCount++;
    for (const k of Object.keys(this.episodes)) { if (--this.episodes[k] <= 0) delete this.episodes[k]; }
    if (this.offline || this.episodes.offline) return null;
    if (--this.statusLeft <= 0) this.nextStatus();
    if (this.episodes.highPressure || this.episodes.heelHigh) this.status = 'walking';

    const r = this.rand, noise = () => (r() - 0.5) * 120;
    let p;
    if (this.status === 'walking') {
      this.phase = (this.phase + 0.31 + r() * 0.12) % 1;
      const ph = this.phase;
      const heelW = gauss(ph, 0.08, 0.1), midW = gauss(ph, 0.25, 0.13), ballW = gauss(ph, 0.4, 0.12), toeW = gauss(ph, 0.52, 0.08);
      // Each 1 s packet mixes the instant gait phase with the average stance load over that second
      const w = [heelW, heelW, midW, midW, ballW, ballW, ballW, ballW, toeW, toeW].map((x) => 0.38 + 0.62 * x);
      p = ZONE_MAX.map((m, i) => m * w[i] * (i < 2 ? this.profile.heel : i > 3 ? this.profile.fore : 1) + 40 + noise());
      this.steps += r() < 0.75 ? 2 : 1;
    } else if (this.status === 'standing') {
      p = ZONE_STAND.map((m, i) => m * (i < 2 ? this.profile.heel : i > 3 ? this.profile.fore : 1) + noise());
    } else {
      p = ZONE_MAX.map(() => 60 + r() * 90);
    }
    if (this.episodes.highPressure) { p[4] = 3750 + r() * 300; p[5] = Math.max(p[5], 3300 + r() * 300); }
    if (this.episodes.heelHigh) { p[0] = 3400 + r() * 300; p[1] = 3200 + r() * 300; for (let i = 4; i < 10; i++) p[i] *= 0.15; }
    p = p.map((v) => Math.round(clamp(v, 0, CONFIG.sensorMax)));

    const tTarget = this.episodes.heat ? 38.2 : this.status === 'walking' ? 33.2 : this.status === 'standing' ? 32 : 30.6;
    const hTarget = this.episodes.moisture ? 90 : this.status === 'walking' ? 67 : 60;
    const kT = this.episodes.heat || Math.abs(tTarget - this.temp) > 1.5 ? 0.12 : 0.01;
    const kH = this.episodes.moisture || Math.abs(hTarget - this.hum) > 6 ? 0.12 : 0.01;
    this.temp += (tTarget - this.temp) * kT + (r() - 0.5) * 0.05;
    this.hum += (hTarget - this.hum) * kH + (r() - 0.5) * 0.3;
    if (this.tickCount % 150 === 0) this.battery = Math.max(1, this.battery - 1);

    const h = p[0] + p[1] + 0.5 * (p[2] + p[3]);
    const f = p.slice(4).reduce((a, b) => a + b, 0) + 0.5 * (p[2] + p[3]);
    const heel_percent = Math.round((h / (h + f)) * 100);
    return {
      device_id: this.deviceId,
      timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      pressure: p,
      heel_percent,
      forefoot_percent: 100 - heel_percent,
      steps: this.steps,
      temperature_c: round1(this.temp),
      humidity_percent: Math.round(this.hum),
      battery_percent: this.episodes.lowBattery ? 9 : Math.round(this.battery),
      status: this.status,
    };
  }
}

/* Builds the simulated fleet. SHOE-003 starts offline to demonstrate the offline state. */
export function createFleet() {
  const now = Date.now();
  return {
    sims: {
      'SHOE-001': new DeviceSimulator(PATIENTS[0], { steps: 1245, temp: 31.2, hum: 64, battery: 87 }),
      'SHOE-002': new DeviceSimulator(PATIENTS[1], { steps: 3810, temp: 32.1, hum: 66, battery: 54 }),
      'SHOE-003': new DeviceSimulator(PATIENTS[2], { steps: 640, temp: 30.8, hum: 58, battery: 12, offline: true }),
    },
    lastKnown: {
      'SHOE-003': { lastSeen: now - 2 * 3600000, packet: { device_id: 'SHOE-003', timestamp: new Date(now - 2 * 3600000).toISOString(),
        pressure: [80, 70, 60, 75, 90, 85, 70, 60, 50, 40], heel_percent: 50, forefoot_percent: 50, steps: 640, temperature_c: 30.8, humidity_percent: 58, battery_percent: 12, status: 'idle' } },
    },
  };
}
