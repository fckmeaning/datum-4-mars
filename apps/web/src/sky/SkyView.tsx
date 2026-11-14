import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatLatLon } from "../globe/coords";
import { LineChart, ViewCard, hhmm, type ChartSeries } from "../views/charts";
import "../views/views.css";
import { MISSION } from "../mission/missionMath";
import { SkyDome } from "./SkyDome";
import { SKY, airTempK, dateForLs, dateForLtst, dayLengthByLs, moonsAt, skyAt, sunDay } from "./marsSky";

export interface SkyViewProps {
  siteName: string;
  lat: number;
  lon: number;
  /** the instant to start from (tests); defaults to now or to the `sky` parameter of the address */
  startMs?: number;
}

const DUST = { from: MISSION.dust_storm_ls_start_deg, to: MISSION.dust_storm_ls_end_deg };

function readStart(params: URLSearchParams, fallback: number): number {
  const v = Number(params.get("sky"));
  return Number.isFinite(v) && v > 0 ? v * 1000 : fallback;
}

function fmtUtc(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtLight(s: number): string {
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.round(s - m * 60)).padStart(2, "0")} s`;
}

/** The Sky tab of a site: where the Sun, Earth, Phobos and Deimos are, when it is light, and the season. */
export function SkyView({ siteName, lat, lon, startMs }: SkyViewProps) {
  const [params, setParams] = useSearchParams();
  const [ms, setMsState] = useState(() => startMs ?? readStart(params, Date.now()));
  const setMs = useCallback(
    (v: number) => {
      setMsState(v);
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.set("sky", String(Math.round(v / 1000)));
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const reset = () => {
    setMsState(Date.now());
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("sky");
        return n;
      },
      { replace: true },
    );
  };

  const snap = useMemo(() => skyAt(lat, lon, ms), [lat, lon, ms]);
  const moons = useMemo(() => moonsAt(lat), [lat]);
  const day = useMemo(() => sunDay(lat, snap.time.declDeg), [lat, snap.time.declDeg]);
  const seasons = useMemo(() => dayLengthByLs(lat, 10), [lat]);
  const ls = snap.time.lsDeg;
  const dust = ls >= DUST.from && ls < DUST.to;
  const earthUp = snap.earth.elevationDeg > SKY.earth_mask_deg;

  const daySeries: ChartSeries[] = [
    { id: "sun", label: "Sun", color: "var(--color-warning)", points: day.map((d) => ({ x: d.ltstH, y: d.elevationDeg })), area: true },
    { id: "earth", label: "Earth", color: "var(--color-info)", points: snap.earthSol.series.map((p) => ({ x: p.ltstH, y: p.elevationDeg })) },
  ];
  const night = snap.riseSet
    ? [
        { from: 0, to: snap.riseSet.riseH, color: "var(--hz-dim)", label: "night" },
        { from: snap.riseSet.setH, to: 24, color: "var(--hz-dim)" },
      ]
    : snap.dayH === 0
      ? [{ from: 0, to: 24, color: "var(--hz-dim)", label: "polar night" }]
      : [];
  const tempSeries: ChartSeries[] = [
    { id: "air", label: "Air temperature", color: "var(--color-danger)", points: Array.from({ length: 49 }, (_, k) => ({ x: k / 2, y: airTempK(k / 2) })) },
  ];
  const seasonSeries: ChartSeries[] = [{ id: "len", label: "Day length", color: "var(--hz-accent)", points: seasons.map((s) => ({ x: s.lsDeg, y: s.dayH })), area: true }];

  const onLs = (v: number) => {
    const ltst = snap.ltstH;
    setMs(dateForLtst(ltst, lon, dateForLs(v, ms)));
  };
  const onLtst = (v: number) => setMs(dateForLtst(v, lon, ms));

  return (
    <div className="sky-view" data-testid="sky-view">
      <header className="vhead">
        <div>
          <div className="vhead__kicker">SKY AND SUN</div>
          <h2>{siteName}</h2>
          <div className="vhead__sub" translate="no">
            {formatLatLon(lat, lon, 3)} · {fmtUtc(ms)}
          </div>
        </div>
        <div className="vcontrols">
          <label>
            <span>
              Season <b>Ls {Math.round(ls)}°</b>
            </span>
            <input type="range" min={0} max={359} step={1} value={Math.round(ls) % 360} onChange={(e) => onLs(Number(e.target.value))} aria-label="Season, solar longitude" />
          </label>
          <label>
            <span>
              Local time <b translate="no">{hhmm(snap.ltstH)}</b>
            </span>
            <input type="range" min={0} max={24} step={0.25} value={snap.ltstH} onChange={(e) => onLtst(Number(e.target.value))} aria-label="Local true solar time" />
          </label>
          <button type="button" onClick={reset} className="vbtn">
            Now
          </button>
        </div>
      </header>

      <div className="vgrid">
        <ViewCard title="Sky dome" badge="COMPUTED" wide note={<>Dashed: tracks of Phobos and Deimos for this latitude. Their <b>position in time</b> needs an ephemeris phase that this app does not carry, so only the track is shown.</>}>
          <div className="skybox">
            <SkyDome sunPath={day} sun={snap.sun} earth={snap.earth} moons={moons} earthUp={earthUp} />
            <dl className="vfacts" data-testid="sky-facts">
              <div>
                <dt>Sun</dt>
                <dd translate="no">
                  {snap.sun.elevationDeg > 0 ? `${snap.sun.elevationDeg.toFixed(1)}° up, az ${snap.sun.azimuthDeg.toFixed(0)}°` : `below the horizon (${snap.sun.elevationDeg.toFixed(1)}°)`}
                </dd>
              </div>
              <div>
                <dt>Sunrise · sunset</dt>
                <dd translate="no">{snap.riseSet ? `${hhmm(snap.riseSet.riseH)} · ${hhmm(snap.riseSet.setH)}` : snap.dayH === 0 ? "no sunrise (polar night)" : "no sunset (polar day)"}</dd>
              </div>
              <div>
                <dt>Day length</dt>
                <dd>{snap.dayH.toFixed(1)} h of a 24 h sol</dd>
              </div>
              <div>
                <dt>Earth</dt>
                <dd translate="no">
                  {snap.earth.elevationDeg > 0 ? `${snap.earth.elevationDeg.toFixed(0)}° up` : "below the horizon"} · {earthUp ? "in link" : "no direct link"}
                </dd>
              </div>
              <div>
                <dt>Earth in view</dt>
                <dd>{snap.earthSol.visibleH.toFixed(1)} h per sol</dd>
              </div>
              <div>
                <dt>Signal delay</dt>
                <dd translate="no">{fmtLight(snap.earth.lightS)} one way</dd>
              </div>
              <div>
                <dt>Sun size</dt>
                <dd>{snap.sunDiameterDeg.toFixed(2)}° (Earth's Sun: 0.53°)</dd>
              </div>
            </dl>
          </div>
        </ViewCard>

        <ViewCard title="One sol: Sun and Earth above the horizon" badge="COMPUTED" wide testId="sky-day-chart" note={`Local true solar time on the axis. Earth counts as visible above ${SKY.earth_mask_deg}° (ASSUMPTION: a clear horizon, terrain not applied).`}>
          <LineChart
            label="Elevation of the Sun and Earth over one sol"
            series={daySeries}
            xDomain={[0, 24]}
            yDomain={[-90, 90]}
            xTicks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
            yTicks={[-90, -45, 0, 45, 90]}
            xFormat={hhmm}
            yFormat={(y) => `${Math.round(y)}°`}
            xLabel="local true solar time"
            yLabel="elevation"
            bands={night}
            hlines={[{ y: 0, label: "horizon" }]}
            marks={[{ x: snap.ltstH, label: "now", color: "var(--hz-accent)" }]}
          />
        </ViewCard>

        <ViewCard title="Season: day length through the Mars year" badge="COMPUTED" testId="sky-season-chart" note={dust ? "The dust-storm season is on now (Ls 180–360): expect less sunlight than this clear-sky curve." : "Dust-storm season is Ls 180–360. The curve is geometric (clear sky)."}>
          <LineChart
            label="Day length against the season"
            series={seasonSeries}
            xDomain={[0, 360]}
            yDomain={[0, 24]}
            xTicks={[0, 90, 180, 270, 360]}
            yTicks={[0, 6, 12, 18, 24]}
            xFormat={(x) => `Ls ${x}°`}
            yFormat={(y) => `${y} h`}
            xLabel="season, Ls"
            yLabel="day length"
            bands={[{ from: DUST.from, to: DUST.to, color: "var(--color-warning)", label: "dust season" }]}
            marks={[{ x: ls, label: "now", color: "var(--hz-accent)" }]}
          />
        </ViewCard>

        <ViewCard title="Air temperature over a sol" badge="ASSUMPTION" testId="sky-temp-chart" note={`A sinusoid around ${SKY.t_air_mean_k} K with a ±${SKY.t_air_amp_k} K swing peaking at ${SKY.t_peak_ltst_h} h (config/params.yaml env and sky). Not a measurement: REMS data is not loaded.`}>
          <LineChart
            label="Air temperature against local time, with the suit limits"
            series={tempSeries}
            xDomain={[0, 24]}
            yDomain={[160, 320]}
            xTicks={[0, 6, 12, 18, 24]}
            yTicks={[160, 200, 240, 280, 320]}
            xFormat={hhmm}
            yFormat={(y) => `${y} K`}
            xLabel="local true solar time"
            yLabel="temperature"
            hlines={[
              { y: SKY.t_suit_min_k, label: "suit minimum", color: "var(--color-info)" },
              { y: SKY.t_suit_max_k, label: "suit maximum", color: "var(--color-danger)" },
            ]}
            marks={[{ x: snap.ltstH, label: "now", color: "var(--hz-accent)" }]}
          />
        </ViewCard>

        <ViewCard title="Phobos and Deimos" badge="COMPUTED" testId="sky-moons" wide note="Circular equatorial orbits from the NASA satellite fact sheet (config/params.yaml sky). Times are Earth hours.">
          <table className="vtable">
            <thead>
              <tr>
                <th>Moon</th>
                <th>Rises in</th>
                <th>Highest point</th>
                <th>Up per pass</th>
                <th>Back after</th>
                <th>Looks</th>
              </tr>
            </thead>
            <tbody>
              {snap.moons.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.name}</th>
                  <td>{m.track.length ? `the ${m.risesIn}` : "never above the horizon here"}</td>
                  <td>{m.track.length ? `${m.maxElevationDeg.toFixed(0)}°` : "—"}</td>
                  <td>{m.track.length ? `${m.upH.toFixed(1)} h` : "—"}</td>
                  <td>{m.synodicH < 48 ? `${m.synodicH.toFixed(1)} h` : `${(m.synodicH / 24).toFixed(1)} days`}</td>
                  <td>
                    {m.diameterDeg.toFixed(2)}° at the zenith ({((m.diameterDeg / snap.sunDiameterDeg) * 100).toFixed(0)} % of the Sun)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ViewCard>
      </div>
      <p className="vfoot">
        Season and clock: Mars24 (Allison and McEwen 2000), the same code path as the API. Earth: approximate Keplerian elements of JPL rotated with the IAU pole of Mars.
      </p>
    </div>
  );
}
