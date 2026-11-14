import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "video/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"]) });
    this.onstop?.();
  }
}

describe("REC", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it("says so when the browser cannot record", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    const { recorder } = await import("./recorder");
    expect(recorder.supported).toBe(false);
    await recorder.toggle();
    expect(recorder.note).toMatch(/desktop browser/i);
  });

  it("notes a cancelled share and stays off", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    const { recorder } = await import("./recorder");
    await recorder.toggle();
    expect(recorder.active).toBe(false);
    expect(recorder.note).toMatch(/cancelled/i);
  });

  it("records, counts the seconds and saves a file when stopped", async () => {
    const track = { addEventListener: vi.fn(), stop: vi.fn() };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia: vi.fn().mockResolvedValue(stream) }, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { recorder } = await import("./recorder");
    await recorder.toggle();
    expect(recorder.active).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(recorder.seconds).toBeGreaterThanOrEqual(3);

    await recorder.toggle(); // stops
    expect(recorder.active).toBe(false);
    expect(click).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(recorder.note).toMatch(/saved/i);
    click.mockRestore();
  });
});
