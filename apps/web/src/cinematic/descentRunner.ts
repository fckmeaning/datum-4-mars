/**
 * descentRunner.ts - runs one descent on a single clock. No React, no DOM, no timers of its own: the caller passes the
 * current time into step(), so tests drive it with a fake clock and the component drives it from requestAnimationFrame.
 */

import type { ScriptedPose } from "../globe/scriptedPose";
import {
  DESCENT_DURATION_S,
  descentFrame,
  reducedMotionFrame,
  skipFrame,
  type DescentFrame,
  type DescentOverlay,
  type DescentParams,
} from "./descentPath";

export interface RunnerHooks {
  /** Pose for the globe (null = hand the camera back). */
  applyPose: (pose: ScriptedPose | null) => void;
  applyOverlay: (overlay: DescentOverlay) => void;
  applyHud: (hud: DescentFrame["hud"], phase: DescentFrame["phase"], altitudeKm: number) => void;
  /** Called once when the real terrain should start loading (before it is faded in). */
  prepareTerrain: () => void;
  /** Called exactly once at the end (also after a skip and in reduced motion). */
  arrive: () => void;
}

export interface RunnerStats {
  frames: number;
  durationS: number;
  avgFps: number;
  /** 1000 / the longest frame time (first frame excluded). */
  minFps: number;
  worstFrameMs: number;
}

export interface RunnerOptions {
  reducedMotion: boolean;
}

const ZERO_OVERLAY: DescentOverlay = { streak: 0, vignette: 0, dust: 0, terrainMix: 0, curtain: 0, entryBadge: 0 };
/** The terrain scene starts loading at this timeline time (in internal seconds it is read from the frame). */
const PREPARE_TERRAIN_AT_T = 5.0;

export class DescentRunner {
  private startMs = 0;
  private skipMs: number | null = null;
  private running = false;
  private arrived = false;
  private terrainPrepared = false;
  private lastMs = 0;
  private frames = 0;
  private worstMs = 0;
  private lastFrame: DescentFrame | null = null;

  constructor(
    private readonly params: DescentParams,
    private readonly hooks: RunnerHooks,
    private readonly options: RunnerOptions,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  get latest(): DescentFrame | null {
    return this.lastFrame;
  }

  start(nowMs: number): void {
    this.startMs = nowMs;
    this.lastMs = nowMs;
    this.running = true;
    this.arrived = false;
    this.skipMs = null;
    this.terrainPrepared = false;
    this.frames = 0;
    this.worstMs = 0;
    if (this.options.reducedMotion) this.hooks.prepareTerrain();
  }

  /** Esc / click. A second call is ignored. */
  skip(nowMs: number): void {
    if (this.running && this.skipMs === null) this.skipMs = nowMs;
  }

  /** Advance to `nowMs`. Returns true while the descent is still running. */
  step(nowMs: number): boolean {
    if (!this.running) return false;
    const elapsed = Math.max(0, (nowMs - this.startMs) / 1000);

    if (this.frames > 0) this.worstMs = Math.max(this.worstMs, nowMs - this.lastMs);
    this.lastMs = nowMs;
    this.frames++;

    let finished = false;
    let curtain = 0;

    if (this.options.reducedMotion) {
      const r = reducedMotionFrame(elapsed);
      curtain = r.curtain;
      finished = r.done;
      this.hooks.applyOverlay({ ...ZERO_OVERLAY, curtain });
    } else {
      const frame = descentFrame(this.params, elapsed);
      this.lastFrame = frame;
      if (!this.terrainPrepared && frame.t >= PREPARE_TERRAIN_AT_T) {
        this.terrainPrepared = true;
        this.hooks.prepareTerrain();
      }
      this.hooks.applyPose(frame.pose);
      this.hooks.applyHud(frame.hud, frame.phase, frame.altitudeKm);
      curtain = frame.overlay.curtain;
      finished = frame.done;
      if (this.skipMs !== null) {
        const s = skipFrame(Math.max(0, (nowMs - this.skipMs) / 1000));
        curtain = Math.max(curtain, s.curtain);
        finished = finished || s.done;
      }
      this.hooks.applyOverlay({ ...frame.overlay, curtain });
    }

    if (this.options.reducedMotion && this.skipMs !== null) {
      const s = skipFrame(Math.max(0, (nowMs - this.skipMs) / 1000));
      finished = finished || s.done;
      this.hooks.applyOverlay({ ...ZERO_OVERLAY, curtain: Math.max(curtain, s.curtain) });
    }

    if (finished) {
      this.finish();
      return false;
    }
    return true;
  }

  /** Stop without arriving (unmount). Hands the camera back. */
  dispose(): void {
    this.running = false;
    this.hooks.applyPose(null);
  }

  stats(): RunnerStats {
    const durationS = Math.max(1e-9, (this.lastMs - this.startMs) / 1000);
    return {
      frames: this.frames,
      durationS,
      avgFps: this.frames / durationS,
      minFps: this.worstMs > 0 ? 1000 / this.worstMs : 0,
      worstFrameMs: this.worstMs,
    };
  }

  private finish(): void {
    this.running = false;
    this.hooks.applyPose(null);
    if (!this.arrived) {
      this.arrived = true;
      this.hooks.arrive();
    }
  }
}

export { DESCENT_DURATION_S };
