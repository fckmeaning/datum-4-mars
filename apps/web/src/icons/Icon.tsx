import type { ReactElement, ReactNode, SVGProps } from "react";

/**
 * One consistent line-icon system: 24 x 24 grid, 1.75 stroke, round caps and joins, `currentColor`.
 * Decorative by default (`aria-hidden`); pass `title` to expose the icon to assistive technology (`role="img"`).
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "title" | "children"> {
  size?: number | string;
  /** Accessible name. Without it the icon is hidden from the accessibility tree. */
  title?: string;
}

export type IconComponent = ((props: IconProps) => ReactElement) & { displayName?: string };

export const ICON_STROKE = 1.75;

export function IconBase({ size = 18, title, children, strokeWidth = ICON_STROKE, ...rest }: IconProps & { children: ReactNode }): ReactElement {
  const labelled = typeof title === "string" && title.length > 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      {...rest}
    >
      {labelled ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Build an icon component from its drawing. */
export function defineIcon(name: string, drawing: ReactNode): IconComponent {
  const Component: IconComponent = (props) => <IconBase {...props}>{drawing}</IconBase>;
  Component.displayName = name;
  return Component;
}
