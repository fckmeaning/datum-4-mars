import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Keeps a WebGL canvas smooth on weak GPUs: it measures the frame rate over two-second windows and, when it stays under
 * `lowFps`, lowers the pixel ratio by 20 % (never below `min`). It never raises it again, so it cannot flip-flop, and on a
 * machine that holds the frame rate nothing changes. Place it inside a `<Canvas>`.
 */
export function AdaptiveDpr({ min = 1, lowFps = 30 }: { min?: number; lowFps?: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const win = useRef({ t: 0, n: 0 });
  useFrame((state, dt) => {
    if (dt > 0.25) return; // a stall (tab switch, big upload) says nothing about the steady frame rate
    const w = win.current;
    w.t += dt;
    w.n++;
    if (w.t < 2) return;
    const fps = w.n / w.t;
    w.t = 0;
    w.n = 0;
    const cur = state.viewport.dpr;
    if (fps < lowFps && cur > min) setDpr(Math.max(min, cur * 0.8));
  });
  return null;
}
