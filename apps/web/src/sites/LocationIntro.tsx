import { useEffect, useState } from "react";
import { formatLatLon } from "../globe/coords";
import "./intro.css";

export const INTRO_MS = 3600;

/** Whether the visitor asked the system for less motion. */
export function reducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * The title card shown when an expedition opens: black bars close in, the place name lands in big letters and the
 * coordinates follow, while the map and the terrain fly in underneath. A click or a key skips it.
 */
export function LocationIntro({
  title,
  kicker,
  lat,
  lon,
  line,
  onDone,
}: {
  title: string;
  kicker: string;
  lat: number;
  lon: number;
  /** e.g. the landing station and the mission sol */
  line?: string;
  onDone?: () => void;
}) {
  const [gone, setGone] = useState(() => reducedMotion());
  useEffect(() => {
    if (gone) {
      onDone?.();
      return;
    }
    const finish = () => setGone(true);
    const t = window.setTimeout(finish, INTRO_MS);
    window.addEventListener("keydown", finish);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);
  if (gone) return null;
  return (
    <div className="loc-intro" translate="no" data-testid="location-intro" role="presentation" onClick={() => setGone(true)}>
      <i className="loc-intro__bar loc-intro__bar--top" />
      <i className="loc-intro__bar loc-intro__bar--bottom" />
      <div className="loc-intro__card">
        <div className="loc-intro__kicker">{kicker}</div>
        <h2 className="loc-intro__title">{title}</h2>
        <div className="loc-intro__rule" />
        <div className="loc-intro__coords">{formatLatLon(lat, lon, 4)}</div>
        {line && <div className="loc-intro__line">{line}</div>}
      </div>
    </div>
  );
}
