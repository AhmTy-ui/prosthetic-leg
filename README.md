# StrideSense — Prosthetic Shoe Web Dashboard

Live web dashboard for the smart prosthetic shoe (ESP32, 10 insole pressure sensors, temperature and humidity).
Built from the Embedded TechLab brief (November 2026). It runs on **simulated data** now. The real ESP32 plugs in later without UI changes.

## Run it

```powershell
npm install
npm run dev        # Node backend on :8080 + React app on http://localhost:5173
```

On a phone, connect to the same Wi-Fi and open `http://<this-PC-IP>:5173`.

Production build: `npm run build` then `npm run server`. The backend serves `dist/` on http://localhost:8080.

| Demo account | Username | Password |
|---|---|---|
| Patient (Daniel Mensah, SHOE-001) | `patient` | `patient123` |
| Patient (Grace Adeyemi, SHOE-002) | `grace` | `patient123` |
| Clinician (all patients) | `clinician` | `clinic123` |

SHOE-003 (Samuel Eze) starts **offline** on purpose, to show the offline state.
Clinicians get **Simulator** buttons on the live dashboard. They trigger high pressure, high heel load, heat, moisture, low battery and offline events.

## Stack

React 18 + Vite · React Router · Chart.js · jsPDF · Node.js backend with WebSockets (`ws`).

## Data flow

```
ESP32 → Wi-Fi → MQTT or HTTPS → Node backend (server/index.js) → [PostgreSQL] → WebSocket /live → React dashboard
```

- `src/lib/shared.js`: zone map, packet normalisation (copes with firmware format changes), ESP32 simulator
- `server/index.js`: login API, role-filtered WebSocket stream, `POST /api/ingest` for the real device
- `src/lib/data.js`: client store, alert engine, history, notes, role checks
- `src/pages/*`: Login, Live dashboard, Patient profile, History, Alerts, Reports (PDF)

## Connecting the real ESP32

**HTTPS option:** POST the packet JSON (exact format from the brief) once per second:
```
POST /api/ingest
X-Device-Key: <INGEST_KEY env var, default dev-device-key>
Content-Type: application/json
{"device_id":"SHOE-001","timestamp":"...","pressure":[...10 values 0-4095...],"heel_percent":18, ...}
```
The first real packet for a device replaces that device's simulator.

**MQTT option:** subscribe in `server/index.js` (e.g. with the `mqtt` package) and call `ingest(JSON.parse(message))`.

## Security

What is in place: token sessions, a separate patient and clinician login, and role-based filtering on the server. Patients only receive their own device's stream; clinicians receive all. Clinician-only routes (Reports, adding notes, alert review, simulator) are enforced in the UI and on the socket.

Still needed before real patient data:
- HTTPS/WSS: put the backend behind a TLS reverse proxy (nginx or Caddy).
- Users, patients, readings, alerts and notes stored in PostgreSQL. History, alerts and notes are currently generated or stored in the browser (`localStorage`) for the prototype.
- bcrypt or argon2 password hashing, login rate limiting, and an audit log.

## Thresholds

All in `CONFIG.thresholds` in `src/lib/shared.js`:

- **High zone pressure:** at least 85% of the sensor range for 3 s.
- **Pressure balance:** heel at or above 65%, or forefoot at or above 88%, averaged over 10 s.
- **Temperature:** warning at 35 °C, alert at 37 °C.
- **Humidity:** warning at 75%, alert at 85%.
- **Battery:** warning at 20%, alert at 10%.
- **Offline:** no data for 10 s.

Agree these values with the clinical team.
