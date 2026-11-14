/**
 * descentStore.ts - the public API of the cinematic: startDescent() / skipDescent().
 * 'Start Simulation' and 'Descend to Gale' call startDescent(); <DescentDirector/> (mounted on the same screen as the globe)
 * performs it. Esc and a click skip.
 */

import { create } from "zustand";

export interface DescentOptions {
  /** Target; default Gale (Bradbury Landing). */
  aoi?: { lat: number; lon: number };
  /** Override the 11 s duration (tests, demos). */
  durationS?: number;
}

export interface DescentRequest extends DescentOptions {
  /** Increments with every start so that a second start is a new run. */
  nonce: number;
}

interface DescentState {
  request: DescentRequest | null;
  /** Counter bumped by skipDescent(); the director compares it with the value at its own start. */
  skipNonce: number;
  start: (opts?: DescentOptions) => void;
  skip: () => void;
  finish: () => void;
}

let nonce = 0;

export const useDescentStore = create<DescentState>((set, get) => ({
  request: null,
  skipNonce: 0,
  start: (opts) => {
    if (get().request) return; // already descending: ignore double clicks
    set({ request: { ...opts, nonce: ++nonce } });
  },
  skip: () => {
    if (get().request) set((s) => ({ skipNonce: s.skipNonce + 1 }));
  },
  finish: () => set({ request: null }),
}));

export const GALE_AOI = { lat: -4.5895, lon: 137.4417 } as const;

export function startDescent(opts?: DescentOptions): void {
  useDescentStore.getState().start(opts);
}

export function skipDescent(): void {
  useDescentStore.getState().skip();
}

export function isDescending(): boolean {
  return useDescentStore.getState().request !== null;
}
