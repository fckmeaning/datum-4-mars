import React from "react";
import "./IconButton.css";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "glove";
  active?: boolean;
}

export function IconButton({
  icon,
  label,
  variant = "default",
  size = "md",
  active = false,
  className = "",
  disabled = false,
  type = "button",
  ...props
}: IconButtonProps) {
  const classes = [
    "icon-button",
    `icon-button--${variant}`,
    `icon-button--${size}`,
    active ? "icon-button--active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={classes}
      {...props}
    >
      {icon}
    </button>
  );
}
