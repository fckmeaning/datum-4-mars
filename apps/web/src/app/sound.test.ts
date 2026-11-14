import { describe, it, expect, vi, beforeEach } from "vitest";

/** A stand-in for the Web Audio API that counts what is built. */
function installAudio() {
  const made = { oscillators: 0, sources: 0, filters: 0, gains: 0, started: 0 };
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const node = (extra: Record<string, unknown> = {}) => {
    const n: Record<string, unknown> = { connect: (x: unknown) => x, start: () => made.started++, stop: vi.fn(), ...extra };
    return n;
  };
  class FakeContext {
    state = "running";
    currentTime = 0;
    sampleRate = 8000;
    destination = node();
    resume = vi.fn();
    suspend = vi.fn(function (this: { state: string }) {
      this.state = "suspended";
      return Promise.resolve();
    });
    createGain() {
      made.gains++;
      return node({ gain: param() });
    }
    createOscillator() {
      made.oscillators++;
      return node({ frequency: param(), detune: param(), type: "sine" });
    }
    createBiquadFilter() {
      made.filters++;
      return node({ frequency: param(), Q: param(), type: "lowpass" });
    }
    createBuffer(_c: number, len: number) {
      return { getChannelData: () => new Float32Array(len) };
    }
    createBufferSource() {
      made.sources++;
      return node({ buffer: null, loop: false });
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  return made;
}

describe("sound of Mars", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("is on unless switched off, but makes no sound until a click wakes the audio", async () => {
    const made = installAudio();
    const { sound } = await import("./sound");
    expect(sound.enabled).toBe(true);
    expect(made.oscillators).toBe(0); // the browser allows audio only after a click
    sound.wake();
    expect(made.sources).toBe(1);
  });

  it("stays off when the person switched it off", async () => {
    window.localStorage.setItem("rh-sound", "off");
    const made = installAudio();
    const { sound } = await import("./sound");
    expect(sound.enabled).toBe(false);
    sound.wake();
    sound.ping("step");
    expect(made.oscillators).toBe(0);
  });

  it("builds the wind and the drone when switched on and remembers the choice", async () => {
    const made = installAudio();
    const { sound } = await import("./sound");
    const seen = vi.fn();
    sound.subscribe(seen);
    sound.toggle(); // off
    sound.toggle(); // on again
    expect(sound.enabled).toBe(true);
    expect(seen).toHaveBeenCalled();
    expect(made.sources).toBe(1); // the wind
    expect(made.oscillators).toBeGreaterThanOrEqual(5); // three drone voices and the slow movements
    expect(window.localStorage.getItem("rh-sound")).toBe("on");
    sound.toggle();
    expect(sound.enabled).toBe(false);
    expect(window.localStorage.getItem("rh-sound")).toBe("off");
    await new Promise((r) => setTimeout(r, 1000));
    expect((sound as unknown as { ctx: { suspend: { mock: { calls: unknown[] } } } }).ctx.suspend.mock.calls.length).toBe(1); // paused, so nothing is heard
  });

  it("plays a signal only while on", async () => {
    const made = installAudio();
    const { sound } = await import("./sound");
    sound.wake();
    const before = made.oscillators;
    sound.ping("step");
    expect(made.oscillators).toBe(before + 1);
    sound.ping("warn");
    expect(made.oscillators).toBe(before + 3); // two pulses
    sound.toggle();
    sound.ping("ok");
    expect(made.oscillators).toBe(before + 3);
  });

  it("does not fail without Web Audio", async () => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
    const { sound } = await import("./sound");
    expect(() => sound.toggle()).not.toThrow();
    expect(() => sound.ping("step")).not.toThrow();
  });
});
