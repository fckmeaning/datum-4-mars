import React, { useState, useEffect, useRef } from "react";
import { apiClient, type Place } from "../api/client";
import { useAppStore } from "../state/store";

interface SearchBoxProps {
  onSelectPlace: (place: Place) => void;
}

export function SearchBox({ onSelectPlace }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const triggerFlyTo = useAppStore((s) => s.triggerFlyTo);
  const siteId = useAppStore((s) => s.siteId);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const places = await apiClient.searchPlaces(query, siteId, 5);
        setResults(places);
        setIsOpen(places.length > 0);
        setHighlightIndex(0);
      } catch {
        setResults([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, siteId]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (place: Place) => {
    triggerFlyTo({ lat: place.lat, lon: place.lon }, 14);
    onSelectPlace(place);
    setQuery(place.name);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[highlightIndex];
      if (selected) handleSelect(selected);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "360px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--color-surface, rgba(16, 24, 38, 0.85))",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          padding: "6px 14px",
        }}
      >
        <span style={{ color: "#8B949E", marginRight: "10px", fontSize: "16px" }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="Search Gale Crater, boxwork, peaks..."
          aria-label="Search places"
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#E6EDF3",
            fontSize: "14px",
            fontFamily: "var(--font-ui, sans-serif)",
            width: "100%",
          }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#8B949E",
              cursor: "pointer",
              fontSize: "14px",
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--color-surface, rgba(16, 24, 38, 0.95))",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "var(--radius-lg, 12px)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
            margin: 0,
            padding: "6px",
            listStyle: "none",
            zIndex: 1000,
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          {results.map((place, idx) => {
            const isHighlighted = idx === highlightIndex;
            return (
              <li
                key={place.id}
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setHighlightIndex(idx)}
                onClick={() => handleSelect(place)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: isHighlighted ? "rgba(86, 180, 233, 0.18)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px", color: isHighlighted ? "#FFFFFF" : "#E6EDF3" }}>
                    {place.name}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      color: place.kind === "base" ? "#56B4E9" : place.science_target ? "#CC79A7" : "#8B949E",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {place.kind}
                  </span>
                </div>
                {place.description && (
                  <span style={{ fontSize: "12px", color: "#8B949E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {place.description}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
