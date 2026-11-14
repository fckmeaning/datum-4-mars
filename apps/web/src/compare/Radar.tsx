export interface RadarAxis {
  label: string;
  /** goodness 0..1 per series, null when there is no data */
  values: Array<number | null>;
}

export interface RadarSeries {
  id: string;
  label: string;
  color: string;
}

const SIZE = 360;
const C = SIZE / 2;
const R = 118;

function pt(axis: number, n: number, v: number): [number, number] {
  const a = (axis / n) * 2 * Math.PI - Math.PI / 2;
  return [C + R * v * Math.cos(a), C + R * v * Math.sin(a)];
}

/** Radar of goodness (outer = best of the compared sites) with one polygon per site. */
export function Radar({ axes, series }: { axes: RadarAxis[]; series: RadarSeries[] }) {
  const n = axes.length;
  const ring = (v: number) => axes.map((_, i) => pt(i, n, v).map((c) => c.toFixed(1)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar" role="img" aria-label="Radar of the compared sites: the outer ring is the best of the set on each axis" data-testid="radar">
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <polygon key={v} points={ring(v)} className={v === 1 ? "radar__ring radar__ring--outer" : "radar__ring"} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, n, 1);
        const [lx, ly] = pt(i, n, 1.17);
        return (
          <g key={a.label}>
            <line x1={C} y1={C} x2={x} y2={y} className="radar__spoke" />
            <text x={lx} y={ly + 3} textAnchor={lx < C - 6 ? "end" : lx > C + 6 ? "start" : "middle"} className="radar__label">
              {a.label}
            </text>
          </g>
        );
      })}
      {series.map((s, si) => {
        const pts = axes.map((a, i) => pt(i, n, a.values[si] ?? 0).map((c) => c.toFixed(1)).join(",")).join(" ");
        return <polygon key={s.id} points={pts} className="radar__poly" data-site={s.id} style={{ stroke: s.color, fill: s.color }} />;
      })}
    </svg>
  );
}
