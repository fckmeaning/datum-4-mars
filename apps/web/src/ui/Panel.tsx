import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from "react";
import { CloseIcon } from "../icons";
import "./Panel.css";

/* ---- Panel ------------------------------------------------------------------------------------------------- */

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Accessible name of the region. */
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Adds the close button; Escape inside the panel also calls it. */
  onClose?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}

/** The one panel/card shell used by Directions, POI, Place, What's here, Layers. Becomes a bottom sheet under 768 px. */
export function Panel({ label, title, subtitle, icon, onClose, footer, children, className = "", onKeyDown, ...rest }: PanelProps): ReactElement {
  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(e);
    if (!e.defaultPrevented && e.key === "Escape" && onClose) {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <section role="region" aria-label={label} className={`panel ${className}`.trim()} onKeyDown={handleKeyDown} {...rest}>
      <div className="panel__grip" aria-hidden="true" />
      <header className="panel__header">
        {icon ? <span className="panel__icon">{icon}</span> : null}
        <div className="panel__titles">
          <h2 className="panel__title">{title}</h2>
          {subtitle ? <p className="panel__subtitle">{subtitle}</p> : null}
        </div>
        {onClose ? (
          <button type="button" className="panel__close" onClick={onClose} aria-label={`Close ${label}`} title="Close (Esc)">
            <CloseIcon size={18} />
          </button>
        ) : null}
      </header>
      <div className="panel__body">{children}</div>
      {footer ? <footer className="panel__footer">{footer}</footer> : null}
    </section>
  );
}

export function PanelSection({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="panel-section">
      <div className="panel-section__head">
        <h3 className="panel-section__title u-caps">{title}</h3>
        {aside ? <span className="panel-section__aside">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

/* ---- Button ------------------------------------------------------------------------------------------------ */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  icon?: ReactNode;
  /** Shows a spinner and sets aria-busy; the button stays in the layout. */
  loading?: boolean;
  block?: boolean;
}

export function Button({ variant = "secondary", icon, loading = false, block = false, className = "", children, type = "button", disabled, ...rest }: ButtonProps): ReactElement {
  const classes = ["btn", `btn--${variant}`, block ? "btn--block" : "", loading ? "btn--loading" : "", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <span className="btn__icon">{icon}</span> : null}
      <span className="btn__label">{children}</span>
    </button>
  );
}

/* ---- Chip -------------------------------------------------------------------------------------------------- */

export type ChipTone = "neutral" | "accent" | "ok" | "warning" | "danger" | "info" | "slate";

export function Chip({ tone = "neutral", icon, children, title }: { tone?: ChipTone; icon?: ReactNode; children: ReactNode; title?: string }): ReactElement {
  return (
    <span className={`chip chip--${tone}`} title={title}>
      {icon ? <span className="chip__icon">{icon}</span> : null}
      {children}
    </span>
  );
}

/* ---- Key / value rows -------------------------------------------------------------------------------------- */

export function KeyValue({ label, value, icon, chip, hint }: { label: ReactNode; value: ReactNode; icon?: ReactNode; chip?: ReactNode; hint?: string }): ReactElement {
  return (
    <div className="kv" title={hint}>
      <dt className="kv__label">
        {icon ? <span className="kv__icon">{icon}</span> : null}
        {label}
      </dt>
      <dd className="kv__value u-num">
        {chip}
        <span>{value}</span>
      </dd>
    </div>
  );
}

export function KeyValueList({ children, label }: { children: ReactNode; label?: string }): ReactElement {
  return (
    <dl className="kv-list" aria-label={label}>
      {children}
    </dl>
  );
}

/* ---- States ------------------------------------------------------------------------------------------------ */

export function Skeleton({ width = "100%", height = 14, radius = 4 }: { width?: number | string; height?: number | string; radius?: number }): ReactElement {
  return <span className="skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius }} />;
}

export function EmptyState({ icon, title, text, action, tone = "neutral" }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode; tone?: "neutral" | "danger" }): ReactElement {
  return (
    <div className={`empty-state empty-state--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {icon ? <span className="empty-state__icon">{icon}</span> : null}
      <p className="empty-state__title">{title}</p>
      {text ? <p className="empty-state__text">{text}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
