/**
 * sound.ts - our own sound of Mars, made on the spot with the Web Audio API (no audio files).
 *
 * Ambient: brown-noise wind through a band-pass whose centre drifts slowly, over a low drone of three detuned
 * oscillators behind a drifting low-pass. Signals: a soft rising ping for every step of the autopilot tour, a
 * double tone for "ok" and a low two-pulse warning for NO-GO. The browser only starts audio after a click, so the
 * context is created when the SOUND button is pressed, or on the first click or key press of a visit (it is on unless the
 * person has switched it off, and the choice is remembered).
 * The recorder (recorder.ts) takes this sound with the tab, so a recorded tour has it.
 */

export type PingKind = "step" | "ok" | "warn";

const KEY = "rh-sound";

function readPref(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off"; // on unless the person switched it off
  } catch {
    return true;
  }
}

function writePref(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage may be blocked */
  }
}

type Ctor = typeof AudioContext;

class SoundEngine {
  private on = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private listeners = new Set<() => void>();
  private armed = false;

  constructor() {
    if (typeof window === "undefined") return;
    this.on = readPref();
    if (this.on) this.arm();
  }

  get enabled(): boolean {
    return this.on;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getSnapshot = (): boolean => this.on;

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** A saved "on" can only make noise after a click: wait for the first one. */
  private arm(): void {
    if (this.armed) return;
    this.armed = true;
    const start = () => {
      this.armed = false;
      if (this.on) this.ensure();
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
  }

  setEnabled(on: boolean): void {
    this.on = on;
    writePref(on);
    if (on) {
      const ctx = this.ensure();
      if (ctx && this.master) this.master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.5);
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
      // once the fade is over the context is paused: nothing is heard and nothing is computed
      const ctx = this.ctx;
      setTimeout(() => {
        if (!this.on && ctx.state === "running") void ctx.suspend();
      }, 900);
    }
    this.emit();
  }

  toggle(): void {
    this.setEnabled(!this.on);
  }

  /** Called from a click (the tour buttons): wakes the audio if it is meant to be on. */
  wake(): void {
    if (this.on) this.ensure();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    const AC: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.on ? 0.5 : 0;
    master.connect(ctx.destination);
    this.master = master;
    this.buildAmbient(ctx, master);
    return ctx;
  }

  private buildAmbient(ctx: AudioContext, out: AudioNode): void {
    // wind: 4 s of brown noise, looped
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 420;
    band.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.55;
    wind.connect(band).connect(windGain).connect(out);
    // gusts: a slow drift of the band and of the level
    const drift = ctx.createOscillator();
    drift.frequency.value = 0.05;
    const driftDepth = ctx.createGain();
    driftDepth.gain.value = 200;
    drift.connect(driftDepth).connect(band.frequency);
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.13;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 0.2;
    gust.connect(gustDepth).connect(windGain.gain);

    // drone: three detuned oscillators behind a low-pass that breathes
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 260;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.06;
    low.connect(droneGain).connect(out);
    const voices: Array<[OscillatorType, number, number]> = [
      ["sawtooth", 55, 0],
      ["sawtooth", 82.5, 7],
      ["sine", 110, -4],
    ];
    const oscs = voices.map(([type, f, cents]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(low);
      return o;
    });
    const breathe = ctx.createOscillator();
    breathe.frequency.value = 0.04;
    const breatheDepth = ctx.createGain();
    breatheDepth.gain.value = 80;
    breathe.connect(breatheDepth).connect(low.frequency);

    for (const n of [wind, drift, gust, breathe, ...oscs]) n.start();
  }

  /** One short signal; nothing when the sound is off. */
  ping(kind: PingKind): void {
    if (!this.on) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, vol: number, lowpass = 4000) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(vol, t + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lowpass;
      o.connect(f).connect(g).connect(this.master!);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    if (kind === "step") tone("sine", 523.25, 783.99, 0, 0.35, 0.09);
    else if (kind === "ok") {
      tone("sine", 659.25, 659.25, 0, 0.18, 0.08);
      tone("sine", 880, 880, 0.14, 0.3, 0.08);
    } else {
      tone("square", 196, 196, 0, 0.16, 0.07, 700);
      tone("square", 196, 196, 0.24, 0.16, 0.07, 700);
    }
  }
}

export const sound = new SoundEngine();
