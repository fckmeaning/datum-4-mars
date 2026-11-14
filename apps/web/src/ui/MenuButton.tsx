import React from "react";
import "./MenuButton.css";

export interface MenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}

export function MenuButton({
  title,
  subtitle,
  icon,
  badge,
  variant = "secondary",
  className = "",
  disabled = false,
  type = "button",
  ...props
}: MenuButtonProps) {
  const classes = [
    "menu-button",
    `menu-button--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      disabled={disabled}
      className={classes}
      {...props}
    >
      <div className="menu-button__content">
        {icon && <div className="menu-button__icon">{icon}</div>}
        <div className="menu-button__text">
          <span className="menu-button__title">{title}</span>
          {subtitle && <span className="menu-button__subtitle">{subtitle}</span>}
        </div>
      </div>
      {badge && <div className="menu-button__meta">{badge}</div>}
    </button>
  );
}
