import React, { useEffect } from "react";
import type { components } from "../api/schema";
import { Badge } from "./Badge";
import { CloseIcon, InfoIcon } from "./Icons";
import { IconButton } from "./IconButton";
import "./DataSourcesPanel.css";

export type SourceEntryData = components["schemas"]["SourceEntry"];

export interface DataSourcesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sources: SourceEntryData[];
  className?: string;
}

export function DataSourcesPanel({
  isOpen,
  onClose,
  sources,
  className = "",
}: DataSourcesPanelProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group sources by family
  const groupedSources = sources.reduce<Record<string, SourceEntryData[]>>(
    (acc, source) => {
      const family = source.family || "other";
      if (!acc[family]) acc[family] = [];
      acc[family].push(source);
      return acc;
    },
    {}
  );

  return (
    <>
      <div
        className="data-sources-modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-sources-title"
        className={`data-sources-panel ${className}`.trim()}
      >
        <div className="data-sources-panel__header">
          <div className="data-sources-panel__title" id="data-sources-title">
            <InfoIcon size={20} />
            Data Sources & Scientific Attribution
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            icon={<CloseIcon size={16} />}
            label="Close data sources panel"
            onClick={onClose}
          />
        </div>

        <div className="data-sources-panel__body">
          {Object.entries(groupedSources).map(([family, items]) => (
            <div key={family} className="data-sources-panel__family-group">
              <h3 className="data-sources-panel__family-title">{family}</h3>
              <div className="data-sources-panel__entries">
                {items.map((src) => (
                  <div key={src.id} className="data-sources-panel__card">
                    <div className="data-sources-panel__card-top">
                      <div className="data-sources-panel__card-name">
                        <a
                          href={src.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="data-sources-panel__link"
                        >
                          {src.product_id || src.id} ↗
                        </a>
                      </div>
                      {src.simulated && (
                        <Badge variant="SIMULATED" size="sm" />
                      )}
                    </div>

                    <div className="data-sources-panel__meta-row">
                      {src.level && (
                        <span className="data-sources-panel__meta-pill">
                          {src.level}
                        </span>
                      )}
                      {src.resolution_m !== undefined && src.resolution_m !== null && (
                        <span className="data-sources-panel__meta-pill">
                          ~{src.resolution_m} m/px
                        </span>
                      )}
                      {src.license && (
                        <span className="data-sources-panel__meta-pill">
                          {src.license}
                        </span>
                      )}
                      {src.retrieved_at && (
                        <span>Retrieved: {src.retrieved_at}</span>
                      )}
                    </div>

                    <p className="data-sources-panel__credit">
                      <strong>Credit:</strong> {src.credit}
                    </p>

                    {src.notes && (
                      <p className="data-sources-panel__notes">{src.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="data-sources-panel__footer">
          <span className="data-sources-panel__disclaimer">
            RESEARCH PROTOTYPE — NOT FOR OPERATIONAL USE
          </span>
          <button
            type="button"
            className="toast__action-button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
