import { useSyncExternalStore } from "react";
import { recorder } from "./recorder";
import { sound } from "./sound";

/** SOUND: our generated sound of Mars on and off (the first press also lets the browser start audio). */
export function SoundButton({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(sound.subscribe, sound.getSnapshot);
  return (
    <button
      type="button"
      className={`${className}${on ? " is-on" : ""}`.trim()}
      aria-pressed={on}
      aria-label={`Sound of Mars: ${on ? "on" : "off"}`}
      title="Wind, a low drone and signals, made on the spot"
      onClick={() => sound.toggle()}
    >
      {on ? "♪ SOUND ON" : "SOUND"}
    </button>
  );
}

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** REC: records this tab, with the sound, to a video file that is saved when REC is pressed again. */
export function RecButton({ className = "" }: { className?: string }) {
  useSyncExternalStore(recorder.subscribe, recorder.getSnapshot);
  const active = recorder.active;
  return (
    <button
      type="button"
      className={`${className}${active ? " is-on is-rec" : ""}`.trim()}
      aria-pressed={active}
      aria-label={active ? "Stop recording" : "Record this tab to a video"}
      title={recorder.note || (active ? "Stop and save the video" : "Record this tab (the browser asks which tab to share)")}
      onClick={() => void recorder.toggle()}
    >
      {active ? `■ REC ${clock(recorder.seconds)}` : recorder.note ? "REC ✕" : "● REC"}
      <span className="visually-hidden" role="status" aria-live="polite">
        {recorder.note}
      </span>
    </button>
  );
}
