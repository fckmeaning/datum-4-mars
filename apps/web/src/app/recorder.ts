/**
 * recorder.ts - REC: records this tab (picture and the sound of sound.ts) to a video file.
 *
 * Uses the browser's own tab capture (getDisplayMedia) and MediaRecorder, so it needs a desktop browser and the person's
 * OK in the browser dialog ("share this tab"); nothing leaves the computer: pressing REC again stops it and the video
 * (WebM) is saved with the browser's download, named datum-4-<date>.webm.
 */

type DisplayOptions = MediaStreamConstraints & { preferCurrentTab?: boolean; selfBrowserSurface?: string };

class Recorder {
  private rec: MediaRecorder | null = null;
  private startedAt = 0;
  private listeners = new Set<() => void>();
  private tick: ReturnType<typeof setInterval> | null = null;
  /** a short note about the last attempt ("cancelled", "needs a desktop browser"), cleared after a few seconds */
  note = "";
  private noteTimer: ReturnType<typeof setTimeout> | null = null;

  get supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined";
  }

  get active(): boolean {
    return this.rec !== null;
  }

  get seconds(): number {
    return this.rec ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
  }

  /** a version that changes whenever the state does, for useSyncExternalStore */
  private version = 0;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = (): number => this.version;

  private emit(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private say(text: string): void {
    this.note = text;
    if (this.noteTimer) clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => {
      this.note = "";
      this.emit();
    }, 4000);
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.rec) {
      this.stop();
      return;
    }
    if (!this.supported) {
      this.say("Recording needs a desktop browser");
      return;
    }
    let stream: MediaStream;
    try {
      const opts: DisplayOptions = { video: { frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: "include" };
      stream = await navigator.mediaDevices.getDisplayMedia(opts as MediaStreamConstraints);
    } catch {
      this.say("Recording cancelled");
      return;
    }
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || "video/webm";
      const blob = new Blob(chunks, { type });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `datum-4-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${type.includes("mp4") ? "mp4" : "webm"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      this.rec = null;
      if (this.tick) clearInterval(this.tick);
      this.tick = null;
      this.say("Saved to your downloads");
    };
    // "Stop sharing" in the browser bar ends the recording too
    stream.getVideoTracks()[0]?.addEventListener("ended", () => this.stop());
    rec.start(1000);
    this.rec = rec;
    this.startedAt = Date.now();
    this.tick = setInterval(() => this.emit(), 1000);
    this.emit();
  }

  stop(): void {
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
  }
}

export const recorder = new Recorder();
