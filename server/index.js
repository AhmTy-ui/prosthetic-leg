/* Prosthetic Shoe — Node.js backend (prototype)
   - POST /api/login, GET /api/me, POST /api/logout  (token sessions, role-based)
   - WebSocket /live?token=...  streams one packet per second per device
     Patients only receive their own device; clinicians receive all.
   - Uses the ESP32 simulator now. To connect the real shoe, call ingest(packet)
     from an MQTT subscriber or an HTTPS POST handler (see /api/ingest below).
   Production: run behind HTTPS (TLS reverse proxy) so the socket becomes wss://,
   hash passwords (bcrypt) and store users/patients/readings in PostgreSQL. */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { PATIENTS, CONFIG, createFleet, normalizePacket } from '../src/lib/shared.js';

const PORT = Number(process.env.PORT || 8080);
const INGEST_KEY = process.env.INGEST_KEY || 'dev-device-key'; // shared secret the ESP32 sends
const SESSION_TTL_MS = 8 * 3600 * 1000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

/* Demo accounts. Passwords are SHA-256 hashed here; use bcrypt/argon2 in production. */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const USERS = [
  { username: 'patient', pass: sha('patient123'), role: 'patient', name: 'Daniel Mensah', patientId: 'P-1001' },
  { username: 'grace', pass: sha('patient123'), role: 'patient', name: 'Grace Adeyemi', patientId: 'P-1002' },
  { username: 'clinician', pass: sha('clinic123'), role: 'clinician', name: 'Dr. A. Bello', patientId: null },
];
const sessions = new Map(); // token -> { user, expires }

function publicUser(u) { return { username: u.username, role: u.role, name: u.name, patientId: u.patientId }; }
function getSession(token) {
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}
function allowedDevices(user) {
  return PATIENTS.filter((p) => user.role === 'clinician' || p.id === user.patientId).map((p) => p.deviceId);
}
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;

/* ---------- Live data ---------- */
const fleet = createFleet();
const lastKnown = {}; // deviceId -> { packet, lastSeen }
Object.entries(fleet.lastKnown).forEach(([id, v]) => { lastKnown[id] = { packet: normalizePacket(v.packet), lastSeen: v.lastSeen }; });

function ingest(raw) {
  const pk = normalizePacket(raw);
  if (!pk) return;
  lastKnown[pk.device_id] = { packet: pk, lastSeen: Date.now() };
  const msg = JSON.stringify({ type: 'packet', data: pk });
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1 && ws.devices?.includes(pk.device_id)) ws.send(msg);
  });
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const { username = '', password = '', role = '' } = await readBody(req);
    const u = USERS.find((x) => x.username === String(username).trim().toLowerCase() && x.pass === sha(String(password)));
    if (!u) return send(res, 401, { error: 'Incorrect username or password.' });
    if (u.role !== role) return send(res, 403, { error: `This account is not a ${role} account. Switch the tab above.` });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { user: u, expires: Date.now() + SESSION_TTL_MS });
    return send(res, 200, { token, user: publicUser(u) });
  }
  if (url.pathname === '/api/me' && req.method === 'GET') {
    const s = getSession(bearer(req));
    return s ? send(res, 200, { user: publicUser(s.user) }) : send(res, 401, { error: 'Not signed in' });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    sessions.delete(bearer(req));
    return send(res, 200, { ok: true });
  }
  /* Real ESP32 path (HTTPS option from the brief): POST the JSON packet with header X-Device-Key */
  if (url.pathname === '/api/ingest' && req.method === 'POST') {
    if (req.headers['x-device-key'] !== INGEST_KEY) return send(res, 401, { error: 'Bad device key' });
    const body = await readBody(req);
    if (!PATIENTS.some((p) => p.deviceId === body.device_id)) return send(res, 404, { error: 'Unknown device' });
    if (fleet.sims[body.device_id]) delete fleet.sims[body.device_id]; // real device replaces its simulator
    ingest(body);
    return send(res, 200, { ok: true });
  }
  // Serve the built frontend if present (npm run build)
  if (req.method === 'GET' && fs.existsSync(DIST)) {
    let file = path.join(DIST, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  send(res, 404, { error: 'Not found' });
});

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const s = url.pathname === '/live' ? getSession(url.searchParams.get('token')) : null;
  if (!s) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.user = s.user;
    ws.devices = allowedDevices(s.user);
    ws.send(JSON.stringify({
      type: 'snapshot',
      devices: ws.devices.map((id) => ({ deviceId: id, packet: lastKnown[id]?.packet || null, lastSeen: lastKnown[id]?.lastSeen || null })),
      offlineAfterMs: CONFIG.offlineAfterMs,
    }));
    ws.on('message', (buf) => {
      let msg; try { msg = JSON.parse(buf); } catch { return; }
      // Demo controls — clinicians only
      if (msg.type === 'simulate' && ws.user.role === 'clinician' && fleet.sims[msg.deviceId]) fleet.sims[msg.deviceId].trigger(msg.what);
    });
  });
});

setInterval(() => {
  Object.values(fleet.sims).forEach((sim) => { const pk = sim.tick(); if (pk) ingest(pk); });
}, CONFIG.updateIntervalMs);

server.listen(PORT, () => console.log(`Backend ready on http://localhost:${PORT}  (WebSocket: ws://localhost:${PORT}/live)`));
