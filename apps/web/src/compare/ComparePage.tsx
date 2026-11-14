import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ViewCard } from "../views/charts";
import "../views/views.css";
import "./compare.css";
import { Radar } from "./Radar";
import { METRICS, bestIndex, goodness, valuesOf, type MetricDef, type SiteInputs } from "./siteMetrics";
import { useSiteInputs } from "./useSiteInputs";

const RADAR_COLORS = ["var(--hz-accent)", "var(--color-info)", "var(--color-warning)"];
const MAX_RADAR = 3;

function fmt(v: number | null, m: MetricDef): string {
  return v === null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: m.digits, maximumFractionDigits: m.digits });
}

export interface ComparePageProps {
  /** inputs for tests; the page loads the layers itself when omitted */
  inputs?: { sites: SiteInputs[]; loading: boolean; offline: boolean };
  /** instant for the date-dependent Earth share (tests) */
  nowMs?: number;
}

/** Side-by-side comparison of all landing sites: table with the best value of each row marked, and a radar of up to three sites. */
export function ComparePage({ inputs, nowMs }: ComparePageProps = {}) {
  const loaded = useSiteInputs();
  const { sites, loading, offline } = inputs ?? loaded;
  const [params] = useSearchParams();
  const [now] = useState(() => nowMs ?? Date.now());
  const first = params.get("site");
  const [picked, setPicked] = useState<string[]>(() => {
    const start = [first, "gale", "jezero", "meridiani"].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
    return start.slice(0, MAX_RADAR);
  });

  const table = useMemo(() => sites.map((s) => valuesOf(s, now)), [sites, now]);
  const best = useMemo(() => METRICS.map((m) => bestIndex(table.map((v) => v[m.id]), m.better)), [table]);
  const good = useMemo(() => METRICS.map((m) => goodness(table.map((v) => v[m.id]), m.better)), [table]);

  const chosen = sites.map((s, i) => ({ s, i })).filter(({ s }) => picked.includes(s.id)).slice(0, MAX_RADAR);
  const radarMetrics = METRICS.map((m, mi) => ({ m, mi })).filter(({ m }) => m.radar);
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_RADAR ? [...cur.slice(1), id] : [...cur, id]));

  return (
    <div className="compare-page" data-testid="compare-page">
      <header className="compare-head">
        <Link to="/globe" className="compare-back">
          ← Globe
        </Link>
        <div>
          <div className="vhead__kicker">COMPARE SITES</div>
          <h1>Where would you build the base?</h1>
          <p className="vhead__sub">Eight landing sites side by side. Modelled layers are sampled at each station; two columns are computed here. The best of each row is marked.</p>
        </div>
      </header>

      {loading && <p className="compare-note" data-testid="compare-loading">Loading the modelled layers…</p>}
      {!loading && offline && (
        <p className="compare-note compare-note--warn" data-testid="compare-offline">
          The modelled layers could not be loaded (the API is not reachable). Day length and Earth visibility are computed here and shown; the other rows are empty rather than guessed.
        </p>
      )}

      <div className="compare-grid">
        <ViewCard title="Radar of the picked sites" badge="COMPUTED" testId="compare-radar" note="Outer ring = best of these eight sites on that axis, centre = worst. It ranks the sites against each other, not against a safety standard.">
          <div className="radar-box">
            <Radar
              axes={radarMetrics.map(({ m, mi }) => ({ label: m.short, values: chosen.map(({ i }) => good[mi]![i] ?? null) }))}
              series={chosen.map(({ s }, k) => ({ id: s.id, label: s.name, color: RADAR_COLORS[k]! }))}
            />
            <ul className="radar-legend">
              {sites.map((s) => {
                const k = chosen.findIndex((c) => c.s.id === s.id);
                return (
                  <li key={s.id}>
                    <label>
                      <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                      <i style={{ background: k >= 0 ? RADAR_COLORS[k] : "transparent", borderColor: k >= 0 ? RADAR_COLORS[k] : "var(--hz-dim)" }} />
                      {s.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </ViewCard>

        <ViewCard title="All sites" badge="MODELED" testId="compare-table-card" wide note={<>{METRICS.map((m) => `${m.label}: ${m.why}`).join(" · ")}. MODELED values come from the global layers (data/pipeline/make_globe_layers.py), not from measurements at the station.</>}>
          <div className="compare-table-wrap">
            <table className="vtable compare-table" data-testid="compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {sites.map((s) => (
                    <th key={s.id}>
                      <Link to={`/site/${s.id}`}>{s.name.replace(" Crater", "").replace(" Planitia", "").replace(" Planum", "")}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m, mi) => (
                  <tr key={m.id} data-metric={m.id}>
                    <th scope="row">
                      {m.label} <small>{m.unit}</small>
                      <span className={`vbadge vbadge--${m.origin.toLowerCase()} compare-badge`}>{m.origin}</span>
                    </th>
                    {sites.map((s, si) => (
                      <td key={s.id} className={best[mi] === si ? "is-best" : ""} data-site={s.id}>
                        {fmt(table[si]![m.id], m)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewCard>
      </div>
    </div>
  );
}

export default ComparePage;
