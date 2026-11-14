import { useState, useEffect, useRef, useId, type KeyboardEvent, type ReactElement } from "react";
import { apiClient, type Place } from "../api/client";
import { useAppStore } from "../state/store";
import { BaseIcon, CrosshairIcon, CloseIcon, PinIcon, RoverIcon, ScienceIcon, SearchIcon } from "../icons";
import { Chip, type ChipTone } from "../ui/Panel";
import { distanceMars, formatDistance, placeKindLabel } from "../ui/format";
import "./SearchBox.css";

interface SearchBoxProps {
  onSelectPlace: (place: Place) => void;
  /** Where distances are measured from; defaults to Bradbury Landing (D-01). */
  base?: { lat: number; lon: number };
}

const DEFAULT_BASE = { lat: -4.5895, lon: 137.4417 };
const MAX_RESULTS = 6;

type Status = "idle" | "loading" | "done" | "error";

function kindIcon(place: Place): ReactElement {
  if (place.kind === "base") return <BaseIcon size={16} />;
  if (place.science_target) return <ScienceIcon size={16} />;
  if (place.kind === "mission_informal") return <RoverIcon size={16} />;
  if (place.kind === "coordinate") return <CrosshairIcon size={16} />;
  return <PinIcon size={16} />;
}

function kindTone(place: Place): ChipTone {
  if (place.kind === "base") return "accent";
  if (place.science_target) return "info";
  return "neutral";
}

/** True when a key press should not be hijacked by the global "/" shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function SearchBox({ onSelectPlace, base = DEFAULT_BASE }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const triggerFlyTo = useAppStore((s) => s.triggerFlyTo);
  const siteId = useAppStore((s) => s.siteId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setStatus("idle");
      setIsOpen(false);
      return;
    }

    setStatus("loading");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const places = await apiClient.searchPlaces(query, siteId, MAX_RESULTS);
        if (cancelled) return;
        setResults(places);
        setStatus("done");
        setIsOpen(true);
        setHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setResults([]);
        setStatus("error");
        setIsOpen(true);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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

  // "/" focuses the search box from anywhere (the usual maps-app shortcut)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleSelect = (place: Place) => {
    triggerFlyTo({ lat: place.lat, lon: place.lon }, 14);
    onSelectPlace(place);
    setQuery(place.name);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (isOpen) {
        e.stopPropagation();
        setIsOpen(false);
      } else if (query) {
        setQuery("");
      } else {
        inputRef.current?.blur();
      }
      return;
    }
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
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const showList = isOpen && status !== "idle";

  return (
    <div ref={wrapperRef} className="search">
      <div className="search__field">
        <SearchIcon size={18} className="search__icon" />
        <input
          ref={inputRef}
          type="text"
          className="search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (status === "done" || status === "error") setIsOpen(true);
          }}
          placeholder="Search Gale Crater, boxwork, peaks…"
          aria-label="Search places"
          aria-autocomplete="list"
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && results.length > 0 ? optionId(highlightIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {status === "loading" && <span className="search__spinner" aria-hidden="true" />}
        {query ? (
          <button
            type="button"
            className="search__clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={16} />
          </button>
        ) : (
          <kbd className="search__hint" aria-hidden="true">
            /
          </kbd>
        )}
      </div>

      {showList && (
        <div className="search__popover">
          {status === "error" ? (
            <p className="search__message" role="alert">
              Search is unavailable right now. Check the connection and try again.
            </p>
          ) : results.length === 0 ? (
            <p className="search__message" role="status">
              No places match “{query.trim()}”. Try a landmark name or paste coordinates like −4.72, 137.40.
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search results" className="search__list">
              {results.map((place, idx) => {
                const highlighted = idx === highlightIndex;
                const dist = distanceMars(base.lat, base.lon, place.lat, place.lon);
                return (
                  <li
                    key={place.id}
                    id={optionId(idx)}
                    role="option"
                    aria-selected={highlighted}
                    className={`search__option${highlighted ? " search__option--active" : ""}`}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => handleSelect(place)}
                  >
                    <span className="search__option-icon">{kindIcon(place)}</span>
                    <span className="search__option-text">
                      <span className="search__option-name">{place.name}</span>
                      {place.description ? <span className="search__option-desc">{place.description}</span> : null}
                    </span>
                    <span className="search__option-meta">
                      <Chip tone={kindTone(place)}>{placeKindLabel(place.kind, place.science_target)}</Chip>
                      <span className="search__option-dist u-num">{place.kind === "base" ? "Base" : `${formatDistance(dist)}`}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
