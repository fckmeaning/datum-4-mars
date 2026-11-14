import type { AltAz, MoonInfo } from "./marsSky";

/** The sky above a site as a dome seen from below the zenith: north up, east right, the horizon is the outer ring. */

const SIZE = 340;
const C = SIZE / 2;
const R = 148;

export function domePoint(az: number, el: number): { x: number; y: number } {
  const r = ((90 - Math.max(-5, Math.min(90, el))) / 90) * R;
  const a = (az * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function poly(points: AltAz[]): string {
  return points.map((p, i) => {
    const q = domePoint(p.azimuthDeg, p.elevationDeg);
    return `${i === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }).join("");
}

/** Split a track where the azimuth jumps (an arc through the zenith or the wrap at north) so the line does not cross the dome. */
function segments(points: AltAz[]): AltAz[][] {
  const out: AltAz[][] = [];
  let cur: AltAz[] = [];
  for (const p of points) {
    const prev = cur[cur.length - 1];
    if (prev && Math.abs(((p.azimuthDeg - prev.azimuthDeg + 540) % 360) - 180) > 30 && p.elevationDeg < 85 && prev.elevationDeg < 85) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface DomeProps {
  /** the Sun's path over the sol (only the part above the horizon is drawn) */
  sunPath: AltAz[];
  sun: AltAz;
  earth: (AltAz & { lightS: number }) | null;
  moons: MoonInfo[];
  /** Earth is above the antenna mask */
  earthUp: boolean;
}

export function SkyDome({ sunPath, sun, earth, moons, earthUp }: DomeProps) {
  const sunUp = sun.elevationDeg > 0;
  const s = domePoint(sun.azimuthDeg, sun.elevationDeg);
  const e = earth ? domePoint(earth.azimuthDeg, earth.elevationDeg) : null;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="skydome" role="img" aria-label="Sky dome: the path of the Sun, Earth and the tracks of Phobos and Deimos" data-testid="sky-dome">
      <circle cx={C} cy={C} r={R} className="skydome__sky" />
      {[0, 30, 60].map((el) => (
        <circle key={el} cx={C} cy={C} r={((90 - el) / 90) * R} className={el === 0 ? "skydome__horizon" : "skydome__ring"} />
      ))}
      <line x1={C} x2={C} y1={C - R} y2={C + R} className="skydome__ring" />
      <line x1={C - R} x2={C + R} y1={C} y2={C} className="skydome__ring" />
      {(
        [
          ["N", 0, -R - 8],
          ["E", R + 9, 4],
          ["S", 0, R + 17],
          ["W", -R - 10, 4],
        ] as const
      ).map(([t, dx, dy]) => (
        <text key={t} x={C + dx} y={C + dy} textAnchor="middle" className="skydome__cardinal">
          {t}
        </text>
      ))}
      {[30, 60].map((el) => (
        <text key={el} x={C + 3} y={C - ((90 - el) / 90) * R - 2} className="skydome__elev">
          {el}°
        </text>
      ))}
      {moons.map((m) =>
        segments(m.track).map((seg, i) => (
          <path key={`${m.id}${i}`} d={poly(seg)} className={`skydome__moon skydome__moon--${m.id}`} data-moon={m.id} />
        )),
      )}
      {sunPath.length > 1 && segments(sunPath.filter((p) => p.elevationDeg >= 0)).map((seg, i) => <path key={i} d={poly(seg)} className="skydome__sunpath" data-testid="sun-path" />)}
      {e && earth && earth.elevationDeg > 0 && (
        <g data-testid="earth-marker" className={earthUp ? "skydome__earth" : "skydome__earth skydome__earth--low"}>
          <circle cx={e.x} cy={e.y} r={6} />
          <text x={e.x + 9} y={e.y + 4}>Earth</text>
        </g>
      )}
      {sunUp && (
        <g data-testid="sun-marker" className="skydome__sun">
          <circle cx={s.x} cy={s.y} r={11} className="skydome__glow" />
          <circle cx={s.x} cy={s.y} r={6} />
        </g>
      )}
    </svg>
  );
}
