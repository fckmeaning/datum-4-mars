import React, { useState, useEffect } from "react";
import { apiClient, type SourceEntry } from "../api/client";
import "./LoadingScreen.css";

export interface LoadingScreenProps {
  onComplete?: () => void;
  autoDismissMs?: number;
}

export function LoadingScreen({ onComplete, autoDismissMs = 1200 }: LoadingScreenProps) {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [loadedSourceIds, setLoadedSourceIds] = useState<Set<string>>(new Set());
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchSources() {
      try {
        const data = await apiClient.listSources();
        if (!active) return;
        setSources(data);

        // Sequentially mark datasets as fetched/ready
        for (let i = 0; i < data.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (!active) return;
          const current = data[i];
          if (current) {
            setLoadedSourceIds((prev) => new Set([...prev, current.id]));
          }
        }

        if (active) {
          setAllDone(true);
        }
      } catch (err) {
        console.warn("LoadingScreen: failed to fetch sources", err);
        if (active) {
          setAllDone(true);
        }
      }
    }

    fetchSources();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (allDone && autoDismissMs > 0 && onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [allDone, autoDismissMs, onComplete]);

  const total = sources.length;
  const loadedCount = loadedSourceIds.size;
  const percent = total > 0 ? Math.round((loadedCount / total) * 100) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="loading-screen"
    >
      <div className="loading-screen__card">
        <div className="loading-screen__header">
          <div className="loading-screen__brand">
            <h1 className="loading-screen__title">DATUM-4</h1>
            <p className="loading-screen__subtitle">PLANETARY RECONNAISSANCE SYSTEM</p>
          </div>
          <span className="loading-screen__status">
            {loadedCount}/{total} DATASETS LOADED
          </span>
        </div>

        <div className="loading-screen__progress-bar-bg">
          <div
            className="loading-screen__progress-bar-fill"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="loading-screen__sources-list">
          {sources.map((src) => {
            const isLoaded = loadedSourceIds.has(src.id);
            return (
              <div
                key={src.id}
                className={`loading-screen__source-row ${
                  isLoaded ? "loading-screen__source-row--loaded" : ""
                }`}
              >
                <div className="loading-screen__source-info">
                  <span className="loading-screen__source-badge">{src.family}</span>
                  <span className="loading-screen__source-name">{src.product_id || src.id}</span>
                </div>
                <div
                  className={`loading-screen__tick ${
                    isLoaded
                      ? "loading-screen__tick--done"
                      : "loading-screen__tick--loading"
                  }`}
                  aria-label={isLoaded ? "Loaded" : "Loading"}
                >
                  {isLoaded ? "✓" : ""}
                </div>
              </div>
            );
          })}
        </div>

        <div className="loading-screen__footer">
          <button
            type="button"
            className="loading-screen__enter-btn"
            onClick={onComplete}
            disabled={!allDone && total > 0}
          >
            {allDone ? "ENTER MISSION →" : "LOADING TELEMETRY..."}
          </button>
        </div>
      </div>
    </div>
  );
}
