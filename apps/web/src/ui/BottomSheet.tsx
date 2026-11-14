import React, { useEffect, useRef } from "react";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./Icons";
import { IconButton } from "./IconButton";
import "./BottomSheet.css";

export type SnapPoint = "collapsed" | "half" | "expanded";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose?: () => void;
  snapPoint?: SnapPoint;
  onSnapChange?: (snap: SnapPoint) => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;
  showBackdrop?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  snapPoint = "half",
  onSnapChange,
  title,
  children,
  headerActions,
  className = "",
  showBackdrop = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Cycle snap points when handle is clicked
  const handleToggleSnap = () => {
    if (!onSnapChange) return;
    if (snapPoint === "collapsed") onSnapChange("half");
    else if (snapPoint === "half") onSnapChange("expanded");
    else onSnapChange("half");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {showBackdrop && snapPoint === "expanded" && (
        <div
          className="bottom-sheet-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        ref={sheetRef}
        role="region"
        aria-label={typeof title === "string" ? title : "Bottom Sheet"}
        className={`bottom-sheet bottom-sheet--${snapPoint} ${className}`.trim()}
      >
        <div
          className="bottom-sheet__handle-bar"
          onClick={handleToggleSnap}
          role="button"
          tabIndex={0}
          aria-label={`Current height: ${snapPoint}. Click to change size.`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleToggleSnap();
            }
          }}
        >
          <div className="bottom-sheet__handle" />
        </div>

        {(title || headerActions || onClose) && (
          <div className="bottom-sheet__header">
            <div className="bottom-sheet__title">{title}</div>
            <div className="bottom-sheet__header-actions">
              {headerActions}
              {onSnapChange && (
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={
                    snapPoint === "expanded" ? (
                      <ChevronDownIcon size={16} />
                    ) : (
                      <ChevronUpIcon size={16} />
                    )
                  }
                  label={snapPoint === "expanded" ? "Collapse" : "Expand"}
                  onClick={() =>
                    onSnapChange(snapPoint === "expanded" ? "half" : "expanded")
                  }
                />
              )}
              {onClose && (
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={<CloseIcon size={16} />}
                  label="Close sheet"
                  onClick={onClose}
                />
              )}
            </div>
          </div>
        )}

        <div className="bottom-sheet__body">{children}</div>
      </div>
    </>
  );
}
