import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "./commands";
import "./palette.css";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

/** Ctrl+K palette: type to filter, arrows to move, Enter to run, Esc to close. */
export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const results = useMemo(() => filterCommands(commands, query).slice(0, 60), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // after the dialog is in the page
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active, results]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="palette-backdrop">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to a site, a view, a page or an action…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="palette__list" role="listbox" id={listId} ref={listRef} aria-label="Commands">
          {results.length === 0 && <li className="palette__empty">Nothing matches “{query}”.</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseMove={() => setActive(i)}
              onClick={() => run(c)}
              data-command={c.id}
            >
              <span className="palette__group">{c.group}</span>
              <span className="palette__title">{c.title}</span>
              {c.hint && <kbd className="palette__hint">{c.hint}</kbd>}
            </li>
          ))}
        </ul>
        <div className="palette__foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

export const SHORTCUTS: Array<{ keys: string; what: string }> = [
  { keys: "Ctrl K", what: "Open the command palette (⌘ K on a Mac)" },
  { keys: "?", what: "Show or hide this list" },
  { keys: "1 – 6", what: "On a site page: 2D, 3D, first person, sky, profile, mission" },
  { keys: "Esc", what: "Close a dialog; stops the guided tour" },
  { keys: "↑ ↓ Enter", what: "Inside the palette: move and run" },
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="shortcuts-backdrop">
      <div className="palette palette--help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1} ref={ref}>
        <h2>Keyboard shortcuts</h2>
        <dl>
          {SHORTCUTS.map((s) => (
            <div key={s.keys}>
              <dt>
                <kbd>{s.keys}</kbd>
              </dt>
              <dd>{s.what}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="palette__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
