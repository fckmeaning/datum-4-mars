import { useId, useMemo, useState, type ReactNode } from "react";

/** Small SVG line chart for the site views: no library, colours come from the theme variables, one readout under the pointer. */

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  /** CSS colour, normally a theme variable such as var(--hz-accent) */
  color: string;
  points: ChartPoint[];
  dashed?: boolean;
  /** fill the area down to the baseline */
  area?: boolean;
  /** drawn as steps instead of a smooth line */
  step?: boolean;
}

export interface ChartBand {
  from: number;
  to: number;
  label?: string;
  /** CSS colour of the band */
  color: string;
}

export interface ChartMark {
  x: number;
  label: string;
  color?: string;
}

export interface ChartHLine {
  y: number;
  label: string;
  color?: string;
}

export interface LineChartProps {
  series: ChartSeries[];
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel: string;
  yLabel: string;
  /** formats an x tick and the x of the readout */
  xFormat?: (x: number) => string;
  yFormat?: (y: number) => string;
  xTicks?: number[];
  yTicks?: number[];
  bands?: ChartBand[];
  marks?: ChartMark[];
  hlines?: ChartHLine[];
  /** accessible description of what the chart shows */
  label: string;
  height?: number;
  testId?: string;
}

const W = 640;
const M = { l: 76, r: 28, t: 14, b: 36 };

function path(points: ChartPoint[], sx: (x: number) => number, sy: (y: number) => number, step?: boolean): string {
  let d = "";
  points.forEach((p, i) => {
    const x = sx(p.x);
    const y = sy(p.y);
    if (i === 0) d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
    else if (step) d += `H${x.toFixed(1)}V${y.toFixed(1)}`;
    else d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return d;
}

export function LineChart(props: LineChartProps) {
  const { series, xDomain, yDomain, xLabel, yLabel, bands = [], marks = [], hlines = [], label, height = 210, testId } = props;
  const xf = props.xFormat ?? ((x: number) => String(Math.round(x * 100) / 100));
  const yf = props.yFormat ?? ((y: number) => String(Math.round(y * 100) / 100));
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const iw = W - M.l - M.r;
  const ih = height - M.t - M.b;
  const sx = (x: number) => M.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * iw;
  const sy = (y: number) => M.t + (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * ih;
  const xTicks = props.xTicks ?? [xDomain[0], (xDomain[0] + xDomain[1]) / 2, xDomain[1]];
  const yTicks = props.yTicks ?? [yDomain[0], (yDomain[0] + yDomain[1]) / 2, yDomain[1]];
  const baseline = sy(Math.max(yDomain[0], Math.min(yDomain[1], 0)));

  const first = series[0]?.points ?? [];
  const readout = useMemo(() => {
    if (hover === null || first.length === 0) return null;
    const x = xDomain[0] + hover * (xDomain[1] - xDomain[0]);
    const vals = series.map((s) => {
      let best = s.points[0];
      for (const p of s.points) if (best === undefined || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
      return { s, p: best };
    });
    return { x, vals };
  }, [hover, series, first.length, xDomain]);

  return (
    <div className="vchart" data-testid={testId}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(1, (f - M.l) / iw)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={M.l} y={M.t} width={iw} height={ih} />
          </clipPath>
        </defs>
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={sx(b.from)} y={M.t} width={Math.max(0, sx(b.to) - sx(b.from))} height={ih} style={{ fill: b.color }} opacity={0.16} />
            {b.label && (
              <text x={sx(b.from) + 4} y={M.t + 11} className="vchart__band">
                {b.label}
              </text>
            )}
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} className="vchart__grid" />
            <text x={M.l - 6} y={sy(t) + 3.5} textAnchor="end" className="vchart__tick">
              {yf(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={M.t + ih} className="vchart__grid vchart__grid--v" />
            <text x={sx(t)} y={height - M.b + 15} textAnchor="middle" className="vchart__tick">
              {xf(t)}
            </text>
          </g>
        ))}
        <text x={M.l + iw / 2} y={height - 4} textAnchor="middle" className="vchart__axis">
          {xLabel}
        </text>
        <text x={10} y={M.t + ih / 2} textAnchor="middle" transform={`rotate(-90 10 ${M.t + ih / 2})`} className="vchart__axis">
          {yLabel}
        </text>
        <g clipPath={`url(#${clipId})`}>
          {hlines.map((h) => (
            <g key={h.label}>
              <line x1={M.l} x2={W - M.r} y1={sy(h.y)} y2={sy(h.y)} className="vchart__ref" style={{ stroke: h.color ?? "var(--hz-dim)" }} />
              <text x={W - M.r - 4} y={sy(h.y) - 4} textAnchor="end" className="vchart__reftext" style={{ fill: h.color ?? "var(--hz-dim)" }}>
                {h.label}
              </text>
            </g>
          ))}
          {series.map((s) => (
            <g key={s.id}>
              {s.area && s.points.length > 1 && (
                <path d={`${path(s.points, sx, sy, s.step)}L${sx(s.points[s.points.length - 1]!.x).toFixed(1)} ${baseline.toFixed(1)}L${sx(s.points[0]!.x).toFixed(1)} ${baseline.toFixed(1)}Z`} style={{ fill: s.color }} opacity={0.14} />
              )}
              <path d={path(s.points, sx, sy, s.step)} className="vchart__line" style={{ stroke: s.color }} strokeDasharray={s.dashed ? "5 4" : undefined} data-series={s.id} />
            </g>
          ))}
        </g>
        {marks.map((m) => (
          <g key={`${m.label}-${m.x}`}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={M.t} y2={M.t + ih} className="vchart__mark" style={{ stroke: m.color ?? "var(--hz-text)" }} />
            <text x={sx(m.x)} y={M.t - 2} textAnchor="middle" className="vchart__marktext" style={{ fill: m.color ?? "var(--hz-text)" }}>
              {m.label}
            </text>
          </g>
        ))}
        {readout && (
          <g pointerEvents="none">
            <line x1={sx(readout.x)} x2={sx(readout.x)} y1={M.t} y2={M.t + ih} className="vchart__cursor" />
            {readout.vals.map(({ s, p }) => p && <circle key={s.id} cx={sx(p.x)} cy={sy(p.y)} r={3.5} style={{ fill: s.color }} />)}
          </g>
        )}
      </svg>
      <div className="vchart__legend" aria-live="off">
        {series.map((s) => (
          <span key={s.id}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <output className="vchart__readout">
          {readout ? (
            <>
              {xf(readout.x)} · {readout.vals.map(({ s, p }) => (p ? `${s.label} ${yf(p.y)}` : "")).join(" · ")}
            </>
          ) : (
            "move over the chart to read values"
          )}
        </output>
      </div>
    </div>
  );
}

/** A titled card that holds a chart or a table, with a badge that says where its numbers come from. */
export function ViewCard({ title, badge, note, children, wide, testId }: { title: string; badge?: "MODELED" | "ASSUMPTION" | "COMPUTED" | "MEASURED"; note?: ReactNode; children: ReactNode; wide?: boolean; testId?: string }) {
  return (
    <section className={`vcard ${wide ? "vcard--wide" : ""}`} data-testid={testId}>
      <header>
        <h3>{title}</h3>
        {badge && <span className={`vbadge vbadge--${badge.toLowerCase()}`}>{badge}</span>}
      </header>
      {children}
      {note && <p className="vcard__note">{note}</p>}
    </section>
  );
}

/** Round axis ticks: a domain widened to a 1, 2 or 5 times a power of ten step, and the ticks on it (about `count`). */
export function niceScale(lo: number, hi: number, count = 4): { domain: [number, number]; ticks: number[] } {
  const span = Math.max(hi - lo, 1e-9);
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = a; t <= b + step * 1e-6; t += step) ticks.push(Number(t.toFixed(10)));
  return { domain: [a, b], ticks };
}

/** Hours as HH:MM. */
export function hhmm(h: number): string {
  const total = Math.round((((h % 24) + 24) % 24) * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
