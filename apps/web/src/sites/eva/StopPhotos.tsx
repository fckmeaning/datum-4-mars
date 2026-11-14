import { useEffect, useState } from "react";
import type { GoalStop } from "../goals";
import { loadStopPhotos, type StopPhoto } from "../photos";

type State = { phase: "loading" } | { phase: "ready"; photos: StopPhoto[] } | { phase: "error"; message: string };

/** What a stop is, why the crew goes there, and photos of the place (bundled at Jezero, NASA raw images at Gale). */
export function StopInfo({ siteId, stop }: { siteId: string; stop: GoalStop }) {
  const [st, setSt] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    setSt({ phase: "loading" });
    loadStopPhotos(siteId, stop)
      .then((photos) => alive && setSt({ phase: "ready", photos }))
      .catch((e) => alive && setSt({ phase: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [siteId, stop]);

  const dynamic = !stop.photo;
  return (
    <section className="stop-info" aria-label={`About ${stop.name}`} data-testid="stop-info">
      <h4>{stop.name}</h4>
      {stop.reason && <p className="stop-info__reason">{stop.reason}</p>}
      {stop.text && <p>{stop.text}</p>}
      {stop.sols && (
        <p className="stop-info__meta">
          Rover here: sols {stop.sols[0]} to {stop.sols[1]}
        </p>
      )}
      {st.phase === "loading" && <p className="stop-info__meta">Loading photos…</p>}
      {st.phase === "error" && <p className="stop-info__meta">Photos could not be loaded ({st.message}).</p>}
      {st.phase === "ready" && st.photos.length === 0 && <p className="stop-info__meta">No photos found for this place.</p>}
      {st.phase === "ready" && st.photos.length > 0 && (
        <>
          <div className="stop-info__photos">
            {st.photos.map((p) => (
              <a key={p.src} href={p.src} target="_blank" rel="noreferrer" title={p.title}>
                <img src={p.src} alt={p.title} loading="lazy" />
              </a>
            ))}
          </div>
          <p className="stop-info__meta">
            {st.photos[0]!.camera}, sol {st.photos[0]!.sol} · {st.photos[0]!.credit}
            {st.photos[0]!.note ? ` · ${st.photos[0]!.note}` : ""}
            {dynamic ? ". Raw images from the sol in the middle of the stay: they show the neighbourhood, not necessarily this exact spot." : ""}
          </p>
        </>
      )}
      <p className="stop-info__meta">Source: {stop.source}</p>
    </section>
  );
}
