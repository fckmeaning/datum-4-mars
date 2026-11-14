/**
 * <DescentDirector/> - the cinematic descent overlay.
 *
 * Mount it on a screen that shows <MarsGlobe/> (the start menu background, /globe). startDescent() (descentStore.ts) starts it.
 * It scripts the globe camera through `descentPoseRef`, paints the overlay (speed streaks, vignette, dust grade, film grain, HUD
 * altitude counter, ENTRY badge) by writing CSS variables and text directly (no React render per frame), cross-fades the real
 * terrain in, ends with a dark curtain, calls `onArrive` and hands the screen over to the next page.
 *
 * Terrain hand-over contract (`terrainLayer`): any React node that fills its parent (position: absolute, 100% x 100%) and renders
 * the real 3D terrain, e.g. <TerrainArrival/>. It is mounted when the dive passes 5 s of the timeline so its data is loaded before
 * the cross-fade (9.0 - 10.2 s), and is faded in over the globe with opacity driven by --descent-terrain.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { descentPoseRef, globeStateRef } from "../globe/scriptedPose";
import { useAppStore } from "../state/store";
import { startArrivalCurtain } from "./arrivalCurtain";
import { DescentRunner, type RunnerHooks, type RunnerStats } from "./descentRunner";
import { ENTRY_ALTITUDE_KM } from "./descentPath";
import { GALE_AOI, skipDescent, useDescentStore } from "./descentStore";
import "./descent.css";

export interface DescentClock {
  now: () => number;
  requestFrame: (cb: () => void) => number;
  cancelFrame: (id: number) => void;
}

export interface DescentDirectorProps {
  /** Called once when the descent ends (also after a skip and in reduced motion). Navigate to the next screen here. */
  onArrive: () => void;
  /** Real terrain scene to cross-fade in; see the contract in the file header. */
  terrainLayer?: ReactNode;
  /** Receives frame statistics at the end (frames, avg fps, worst frame). */
  onStats?: (stats: RunnerStats) => void;
  /** Injectable clock for tests. */
  clock?: DescentClock;
}

declare global {
  interface Window {
    __areonavDescentStats?: RunnerStats;
  }
}

const defaultClock: DescentClock = {
  now: () => performance.now(),
  requestFrame: (cb) => window.requestAnimationFrame(() => cb()),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
};

function prefersReducedMotion(): boolean {
  if (useAppStore.getState().settings.reducedMotion) return true;
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DescentDirector({ onArrive, terrainLayer, onStats, clock = defaultClock }: DescentDirectorProps) {
  const request = useDescentStore((s) => s.request);
  const rootRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<HTMLDivElement>(null);
  const [terrainOn, setTerrainOn] = useState(false);
  const onArriveRef = useRef(onArrive);
  const onStatsRef = useRef(onStats);

  useEffect(() => {
    onArriveRef.current = onArrive;
    onStatsRef.current = onStats;
  }, [onArrive, onStats]);

  const nonce = request?.nonce ?? null;

  useEffect(() => {
    if (nonce === null) return;
    const req = useDescentStore.getState().request;
    const root = rootRef.current;
    if (!req || !root) return;

    setTerrainOn(false);
    const aoi = req.aoi ?? GALE_AOI;
    const live = globeStateRef.current;
    const setVar = (name: string, v: number) => root.style.setProperty(name, v.toFixed(4));

    const hooks: RunnerHooks = {
      applyPose: (pose) => {
        descentPoseRef.current = pose;
      },
      applyOverlay: (o) => {
        setVar("--descent-streak", o.streak);
        setVar("--descent-vignette", o.vignette);
        setVar("--descent-dust", o.dust);
        setVar("--descent-terrain", o.terrainMix);
        setVar("--descent-curtain", o.curtain);
        setVar("--descent-entry", o.entryBadge);
      },
      applyHud: (hud, phase) => {
        if (altRef.current) altRef.current.textContent = hud.altitudeText;
        if (phaseRef.current && phaseRef.current.textContent !== hud.phaseLabel) phaseRef.current.textContent = hud.phaseLabel;
        if (coordsRef.current && !coordsRef.current.textContent) coordsRef.current.textContent = hud.coordsText;
        if (root.dataset.phase !== phase) root.dataset.phase = phase;
      },
      prepareTerrain: () => setTerrainOn(true),
      arrive: () => {
        const stats = runner.stats();
        window.__areonavDescentStats = stats;
        onStatsRef.current?.(stats);
        startArrivalCurtain();
        onArriveRef.current();
        useDescentStore.getState().finish();
      },
    };

    const runner = new DescentRunner(
      { aoi, start: { rotX: live.rotX, rotY: live.rotY, distance: live.distance }, durationS: req.durationS },
      hooks,
      { reducedMotion: prefersReducedMotion() },
    );

    let frameId = 0;
    const tick = () => {
      if (runner.step(clock.now())) frameId = clock.requestFrame(tick);
    };

    const skip = () => runner.skip(clock.now());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // swallow Esc so the screen underneath does not also react (the globe screen would leave to the menu)
        e.preventDefault();
        e.stopPropagation();
        skip();
      }
    };
    window.addEventListener("keydown", onKey, true);
    root.addEventListener("pointerdown", skip);
    const unsubscribe = useDescentStore.subscribe((state, prev) => {
      if (state.skipNonce !== prev.skipNonce) skip();
    });

    runner.start(clock.now());
    frameId = clock.requestFrame(tick);

    return () => {
      clock.cancelFrame(frameId);
      window.removeEventListener("keydown", onKey, true);
      root.removeEventListener("pointerdown", skip);
      unsubscribe();
      runner.dispose(); // hands the camera back to the interactive globe
    };
  }, [nonce, clock]);

  if (!request) return null;

  return (
    <div ref={rootRef} className="descent" data-phase="orbit" data-testid="descent-director">
      <div className="descent__terrain" aria-hidden="true">
        {terrainOn ? terrainLayer : null}
      </div>
      <div className="descent__dust" aria-hidden="true" />
      <div className="descent__streak" aria-hidden="true" />
      <div className="descent__vignette" aria-hidden="true" />
      <div className="descent__grain" aria-hidden="true" />

      <div className="descent__hud" aria-hidden="true">
        <div className="descent__phase" ref={phaseRef}>
          HIGH ORBIT
        </div>
        <div className="descent__alt">
          <span className="descent__alt-label">ALT</span>
          <span className="descent__alt-value" ref={altRef}>
            7,472 km
          </span>
        </div>
        <div className="descent__coords" ref={coordsRef} />
        <div className="descent__tc">TIME-COMPRESSED</div>
      </div>

      <div className="descent__entry" aria-hidden="true">
        ENTRY INTERFACE · {ENTRY_ALTITUDE_KM} km
      </div>

      <button type="button" className="descent__skip" autoFocus onClick={skipDescent}>
        Skip <kbd>Esc</kbd>
      </button>

      <div className="descent__curtain" aria-hidden="true" />
      <p className="descent__sr" role="status">
        Descent to Gale crater started. Press Escape or click to skip.
      </p>
    </div>
  );
}
