import React, { useState, useRef, useEffect, useId } from "react";
import { SearchIcon, CloseIcon } from "./Icons";
import "./SearchBox.css";

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  kind?: string;
}

export interface SearchBoxProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (query: string) => void;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  suggestions?: SearchSuggestion[];
  onSelectSuggestion?: (suggestion: SearchSuggestion) => void;
  loading?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function SearchBox({
  placeholder = "Search places, landmarks, coordinates...",
  value: controlledValue,
  defaultValue = "",
  onChange,
  onSearch,
  onClear,
  suggestions = [],
  onSelectSuggestion,
  loading = false,
  className = "",
  autoFocus = false,
}: SearchBoxProps) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const query = isControlled ? controlledValue : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!isControlled) {
      setInternalValue(val);
    }
    onChange?.(val);
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const handleClear = () => {
    if (!isControlled) {
      setInternalValue("");
    }
    onChange?.("");
    onClear?.();
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
        const selected = suggestions[activeIndex];
        if (selected) {
          onSelectSuggestion?.(selected);
          if (!isControlled) setInternalValue(selected.title);
          setIsOpen(false);
        }
      } else {
        onSearch?.(query);
        setIsOpen(false);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
      }
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    }
  };

  const handleSelect = (item: SearchSuggestion) => {
    onSelectSuggestion?.(item);
    if (!isControlled) {
      setInternalValue(item.title);
    }
    setIsOpen(false);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasSuggestions = isOpen && suggestions.length > 0;

  return (
    <div ref={containerRef} className={`search-box ${className}`.trim()}>
      <div className="search-box__field">
        <span className="search-box__icon">
          <SearchIcon size={18} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hasSuggestions}
          aria-controls={hasSuggestions ? listboxId : undefined}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-item-${activeIndex}` : undefined
          }
          className="search-box__input"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="search-box__clear"
            aria-label="Clear search"
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      {hasSuggestions && (
        <ul
          id={listboxId}
          role="listbox"
          className="search-box__suggestions"
          aria-label="Suggestions"
        >
          {suggestions.map((item, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li
                key={item.id}
                id={`${listboxId}-item-${idx}`}
                role="option"
                aria-selected={isActive}
                className={`search-box__suggestion-item ${
                  isActive ? "search-box__suggestion-item--active" : ""
                }`}
                onClick={() => handleSelect(item)}
              >
                <div className="search-box__suggestion-main">
                  <span className="search-box__suggestion-title">{item.title}</span>
                  {item.subtitle && (
                    <span className="search-box__suggestion-subtitle">
                      {item.subtitle}
                    </span>
                  )}
                </div>
                {item.kind && (
                  <span className="search-box__suggestion-kind">{item.kind}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
