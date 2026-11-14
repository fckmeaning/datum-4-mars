import React from "react";
import { WarningIcon, CheckIcon, InfoIcon, CloseIcon } from "./Icons";
import { IconButton } from "./IconButton";
import "./Toast.css";

export type ToastSeverity = "ok" | "warning" | "danger" | "info";

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  severity?: ToastSeverity;
  onDismiss?: (id: string) => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function Toast({
  id,
  title,
  message,
  severity = "info",
  onDismiss,
  action,
  className = "",
}: ToastProps) {
  const renderIcon = () => {
    switch (severity) {
      case "ok":
        return <CheckIcon size={18} />;
      case "warning":
      case "danger":
        return <WarningIcon size={18} />;
      case "info":
      default:
        return <InfoIcon size={18} />;
    }
  };

  return (
    <div
      role="alert"
      aria-live={severity === "danger" ? "assertive" : "polite"}
      className={`toast toast--${severity} ${className}`.trim()}
    >
      <div className="toast__icon">{renderIcon()}</div>

      <div className="toast__content">
        {title && <span className="toast__title">{title}</span>}
        <span className="toast__message">{message}</span>

        {action && (
          <div className="toast__actions">
            <button
              type="button"
              className="toast__action-button"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          </div>
        )}
      </div>

      {onDismiss && (
        <div className="toast__dismiss">
          <IconButton
            size="sm"
            variant="ghost"
            icon={<CloseIcon size={14} />}
            label="Dismiss notification"
            onClick={() => onDismiss(id)}
          />
        </div>
      )}
    </div>
  );
}
