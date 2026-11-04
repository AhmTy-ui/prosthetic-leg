import { CONFIG, ZONES, pressureLevel } from '../lib/data.js';

/* Insole outline for a RIGHT foot seen from above (big toe on the inner/left side).
   A left foot is drawn mirrored. Zone centres follow the brief's sensor order 1–10. */
const OUTLINE = 'M100 432 C66 432 50 405 52 365 C54 330 64 300 62 268 C60 238 40 210 36 170 C33 135 42 105 70 96 C100 88 140 92 160 108 C175 122 172 165 163 210 C155 250 148 290 148 330 C148 375 140 432 100 432 Z';
const TOES = [
  { cx: 72, cy: 62, rx: 21, ry: 27 }, { cx: 108, cy: 50, rx: 12, ry: 15 }, { cx: 132, cy: 58, rx: 11, ry: 13 },
  { cx: 151, cy: 72, rx: 10, ry: 12 }, { cx: 166, cy: 90, rx: 9, ry: 10 },
];
const POS = [
  [84, 382], [118, 382],   // 1 inner heel, 2 outer heel
  [80, 272], [128, 266],   // 3 inner midfoot, 4 outer midfoot
  [60, 148], [89, 136], [118, 138], [146, 152], // 5–8 ball of foot inner → outer
  [72, 62], [138, 66],     // 9 big toe, 10 other toes
];
const RADIUS = [34, 34, 30, 32, 28, 26, 26, 28, 28, 36];

/* Single-hue teal intensity scale (relative pressure 0–1). Green/amber/red are kept for states only. */
const RAMP = [[196, 228, 225], [120, 190, 184], [40, 148, 144], [13, 95, 93], [7, 58, 57]];
export function heatColor(t) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  const c = RAMP[i].map((v, k) => Math.round(v + (RAMP[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function FootMap({ pressure, side = 'Right', zoneStates = {}, dim = false }) {
  const mirror = side === 'Left';
  const mx = (x) => (mirror ? 200 - x : x);
  const rel = (pressure || new Array(10).fill(0)).map((v) => v / CONFIG.sensorMax);
  return (
    <svg className="foot-svg" viewBox="0 0 200 445" role="img"
      aria-label={`${side} foot pressure map. ` + ZONES.map((z, i) => `${z.name}: ${pressureLevel(rel[i])}`).join('; ')}>
      <defs>
        <clipPath id="insole">
          <g transform={mirror ? 'translate(200,0) scale(-1,1)' : undefined}>
            <path d={OUTLINE} />{TOES.map((t, i) => <ellipse key={i} {...t} />)}
          </g>
        </clipPath>
        {rel.map((r, i) => (
          <radialGradient key={i} id={`zg${i}`}>
            <stop offset="0%" stopColor={heatColor(r)} stopOpacity={0.35 + 0.65 * Math.min(1, r * 1.4)} />
            <stop offset="60%" stopColor={heatColor(r)} stopOpacity={0.2 + 0.5 * r} />
            <stop offset="100%" stopColor={heatColor(r)} stopOpacity="0" />
          </radialGradient>
        ))}
        <filter id="soft"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>

      <g transform={mirror ? 'translate(200,0) scale(-1,1)' : undefined}>
        <path d={OUTLINE} fill="#f1f5f7" />
        {TOES.map((t, i) => <ellipse key={i} {...t} fill="#f1f5f7" />)}
      </g>
      <g clipPath="url(#insole)" opacity={dim ? 0.35 : 1}>
        {POS.map(([x, y], i) => (
          <circle key={i} cx={mx(x)} cy={y} r={RADIUS[i] * (1.05 + rel[i] * 0.5)} fill={`url(#zg${i})`} filter="url(#soft)" style={{ transition: 'r .4s' }} />
        ))}
      </g>
      <g transform={mirror ? 'translate(200,0) scale(-1,1)' : undefined} fill="none" stroke="#b9c6cf" strokeWidth="1.5">
        <path d={OUTLINE} />{TOES.map((t, i) => <ellipse key={i} {...t} />)}
      </g>

      {POS.map(([x, y], i) => {
        const st = zoneStates[i + 1];
        return (
          <g key={i} className="zone-hit">
            <title>{`Zone ${i + 1} · ${ZONES[i].name}: ${pressureLevel(rel[i])} (${Math.round(rel[i] * 100)}% of range)`}</title>
            <circle className={`zone-ring ${st || ''}`} cx={mx(x)} cy={y} r="15" />
            <circle className="zone-dot" cx={mx(x)} cy={y} r="9.5" />
            <text className="zone-label" x={mx(x)} y={y + 3.8} textAnchor="middle">{i + 1}</text>
          </g>
        );
      })}
      <text x="100" y="443" textAnchor="middle" fontSize="10" fill="#8a96a3">{side.toUpperCase()} FOOT · HEEL</text>
    </svg>
  );
}
