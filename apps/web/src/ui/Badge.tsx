import React from "react";
import "./Badge.css";

export type BadgeVariant =
  | "SIMULATED"
  | "APPROXIMATE"
  | "REPLAY"
  | "LIVE"
  | "FASTEST"
  | "SAFEST"
  | "BALANCED"
  | "SCIENCE"
  | "ok"
  | "warning"
  | "danger"
  | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  children?: React.ReactNode;
  size?: "sm" | "md";
  icon?: React.ReactNode;
}

export function Badge({
  variant,
  children,
  size = "md",
  icon,
  className = "",
  ...props
}: BadgeProps) {
  const classes = ["badge", `badge--${variant}`, `badge--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {icon && <span className="badge__icon">{icon}</span>}
      {children || variant}
    </span>
  );
}
