import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../state/store";
import { globalAutopilot, type AutopilotToast } from "./autopilot";

export interface UseAutopilotOptions {
  showToast?: (toast: AutopilotToast) => void;
  setFlyIn?: (flyIn: boolean) => void;
}

export function useAutopilot(options: UseAutopilotOptions = {}) {
  const navigate = useNavigate();
  const running = useAppStore((s) => s.autopilotRunning);
  const step = useAppStore((s) => s.autopilotStep);
  const caption = useAppStore((s) => s.autopilotCaption);

  // Keep controller context up to date with navigation and callbacks
  useEffect(() => {
    // only what this page provides: another page's setFlyIn must not be wiped by one that has none
    globalAutopilot.setContext({
      navigate,
      ...(options.showToast ? { showToast: options.showToast } : {}),
      ...(options.setFlyIn ? { setFlyIn: options.setFlyIn } : {}),
    });
  }, [navigate, options.showToast, options.setFlyIn]);

  const start = useCallback(() => {
    globalAutopilot.start();
  }, []);

  const stop = useCallback(() => {
    globalAutopilot.stop();
  }, []);

  const toggle = useCallback(() => {
    if (globalAutopilot.running) {
      globalAutopilot.stop();
    } else {
      globalAutopilot.start();
    }
  }, []);

  // Listen to Escape key globally to cancel tour if active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && globalAutopilot.running) {
        e.preventDefault();
        e.stopPropagation();
        globalAutopilot.stop();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return {
    running,
    step,
    caption,
    start,
    stop,
    toggle,
  };
}
