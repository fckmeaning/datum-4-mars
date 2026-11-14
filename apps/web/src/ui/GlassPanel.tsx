import React from "react";
import "./GlassPanel.css";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "surface" | "elevated" | "bordered";
  padding?: "none" | "sm" | "md" | "lg";
  children?: React.ReactNode;
  as?: React.ElementType;
}

export function GlassPanel({
  variant = "default",
  padding = "md",
  children,
  className = "",
  as: Component = "div",
  ...props
}: GlassPanelProps) {
  const classes = [
    "glass-panel",
    `glass-panel--${variant}`,
    `glass-panel--padding-${padding}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
