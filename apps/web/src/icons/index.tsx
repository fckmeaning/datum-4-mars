import type { ReactElement } from "react";
import { defineIcon, IconBase, type IconComponent, type IconProps } from "./Icon";

export type { IconProps, IconComponent } from "./Icon";
export { IconBase, defineIcon, ICON_STROKE } from "./Icon";

/* ---- Interface ---------------------------------------------------------------------------------------------- */
export const SearchIcon = defineIcon("SearchIcon", <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>);
export const CloseIcon = defineIcon("CloseIcon", <path d="M6 6l12 12M18 6L6 18" />);
export const CheckIcon = defineIcon("CheckIcon", <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const PlusIcon = defineIcon("PlusIcon", <path d="M12 5v14M5 12h14" />);
export const MinusIcon = defineIcon("MinusIcon", <path d="M5 12h14" />);
export const ChevronRightIcon = defineIcon("ChevronRightIcon", <path d="M9 5l7 7-7 7" />);
export const ChevronLeftIcon = defineIcon("ChevronLeftIcon", <path d="M15 5l-7 7 7 7" />);
export const ChevronDownIcon = defineIcon("ChevronDownIcon", <path d="M5 9l7 7 7-7" />);
export const ChevronUpIcon = defineIcon("ChevronUpIcon", <path d="M5 15l7-7 7 7" />);
export const CopyIcon = defineIcon("CopyIcon", <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 4H7a2 2 0 0 0-2 2v9" /></>);
export const DownloadIcon = defineIcon("DownloadIcon", <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />);
export const SwapIcon = defineIcon("SwapIcon", <path d="M7 4v14M3.5 14.5L7 18l3.5-3.5M17 20V6M13.5 9.5L17 6l3.5 3.5" />);
export const GripIcon = defineIcon(
  "GripIcon",
  <g fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.2" /><circle cx="15" cy="6" r="1.2" />
    <circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" />
    <circle cx="9" cy="18" r="1.2" /><circle cx="15" cy="18" r="1.2" />
  </g>,
);
export const InfoIcon = defineIcon("InfoIcon", <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.7h.01" /></>);
export const WarningIcon = defineIcon("WarningIcon", <><path d="M12 3.5L2.5 20h19z" /><path d="M12 10v4.5M12 17.5h.01" /></>);
export const ClockIcon = defineIcon("ClockIcon", <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);

/* ---- Map and navigation ------------------------------------------------------------------------------------- */
export const PlanetIcon = defineIcon("PlanetIcon", <><circle cx="12" cy="12" r="5" /><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-20 12 12)" /></>);
export const PinIcon = defineIcon("PinIcon", <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const DirectionsIcon = defineIcon("DirectionsIcon", <><path d="M12 3l9 9-9 9-9-9z" /><path d="M9 15v-3a2 2 0 0 1 2-2h4M13 7.5l2.5 2.5-2.5 2.5" /></>);
export const LayersIcon = defineIcon("LayersIcon", <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5" /></>);
export const RouteIcon = defineIcon("RouteIcon", <><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" /></>);
export const CrosshairIcon = defineIcon(
  "CrosshairIcon",
  <><circle cx="12" cy="12" r="6" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
);
export const CompassIcon = defineIcon("CompassIcon", <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>);
export const BaseIcon = defineIcon("BaseIcon", <><path d="M4 19a8 8 0 0 1 16 0" /><path d="M2.5 19h19M12 11V6.5h3" /></>);
export const FlagIcon = defineIcon("FlagIcon", <path d="M6 21V4M6 5h11l-2.5 3.5L17 12H6" />);
export const ScienceIcon = defineIcon("ScienceIcon", <><path d="M9.5 3h5M10.5 3v6l-5 9.2A1.8 1.8 0 0 0 7.1 21h9.8a1.8 1.8 0 0 0 1.6-2.8L13.5 9V3" /><path d="M8 15h8" /></>);
export const RoverIcon = defineIcon("RoverIcon", <><rect x="5" y="8" width="14" height="6" rx="1.5" /><circle cx="7.5" cy="18" r="2" /><circle cx="12" cy="18" r="2" /><circle cx="16.5" cy="18" r="2" /><path d="M15 8V4M13.5 4h3" /></>);
export const CameraIcon = defineIcon("CameraIcon", <><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></>);
export const MountainIcon = defineIcon("MountainIcon", <path d="M3 19l6.5-11 3.5 5.5 2.5-3.5L21 19z" />);
export const SlopeIcon = defineIcon("SlopeIcon", <><path d="M3 19L19 7M3 19h16" /><path d="M8 19c0-1.8-.6-3.2-1.7-4.3" /></>);
export const GlobeGridIcon = defineIcon("GlobeGridIcon", <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>);

/* ---- Environment and consumables ---------------------------------------------------------------------------- */
export const ThermometerIcon = defineIcon("ThermometerIcon", <><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" /><path d="M12 9v7" /></>);
export const SunIcon = defineIcon(
  "SunIcon",
  <><circle cx="12" cy="12" r="3.8" /><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" /></>,
);
export const SunsetIcon = defineIcon("SunsetIcon", <><path d="M7.5 17a4.5 4.5 0 0 1 9 0M3 17h18M5 21h14" /><path d="M12 4v5M9.5 6.5L12 9l2.5-2.5" /></>);
export const AntennaIcon = defineIcon(
  "AntennaIcon",
  <><circle cx="12" cy="10" r="1.8" /><path d="M12 12v9M8 21h8" /><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4" /></>,
);
export const RadiationIcon = defineIcon(
  "RadiationIcon",
  <>
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <path d="M12 3a9 9 0 0 1 7.8 4.5L15.5 10A4 4 0 0 0 12 8z" />
    <path d="M12 3a9 9 0 0 1 7.8 4.5L15.5 10A4 4 0 0 0 12 8z" transform="rotate(120 12 12)" />
    <path d="M12 3a9 9 0 0 1 7.8 4.5L15.5 10A4 4 0 0 0 12 8z" transform="rotate(240 12 12)" />
  </>,
);
export const OxygenIcon = defineIcon("OxygenIcon", <><rect x="8" y="7" width="8" height="13" rx="3" /><path d="M10 7V5h4v2M11 4h2" /></>);
export const EnergyIcon = defineIcon("EnergyIcon", <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />);

/* ---- Verdicts ----------------------------------------------------------------------------------------------- */
export const ReadyIcon = defineIcon("ReadyIcon", <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>);
export const CautionIcon = WarningIcon;
export const NoGoIcon = defineIcon("NoGoIcon", <><path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" /><path d="M9 9l6 6M15 9l-6 6" /></>);

/** Every icon by name, for the UI kit page, `<Icon name>` and the tests. */
export const ICONS = {
  search: SearchIcon,
  close: CloseIcon,
  check: CheckIcon,
  plus: PlusIcon,
  minus: MinusIcon,
  "chevron-right": ChevronRightIcon,
  "chevron-left": ChevronLeftIcon,
  "chevron-down": ChevronDownIcon,
  "chevron-up": ChevronUpIcon,
  copy: CopyIcon,
  download: DownloadIcon,
  swap: SwapIcon,
  grip: GripIcon,
  info: InfoIcon,
  warning: WarningIcon,
  clock: ClockIcon,
  planet: PlanetIcon,
  pin: PinIcon,
  directions: DirectionsIcon,
  layers: LayersIcon,
  route: RouteIcon,
  crosshair: CrosshairIcon,
  compass: CompassIcon,
  base: BaseIcon,
  flag: FlagIcon,
  science: ScienceIcon,
  rover: RoverIcon,
  camera: CameraIcon,
  mountain: MountainIcon,
  slope: SlopeIcon,
  "globe-grid": GlobeGridIcon,
  thermometer: ThermometerIcon,
  sun: SunIcon,
  sunset: SunsetIcon,
  antenna: AntennaIcon,
  radiation: RadiationIcon,
  oxygen: OxygenIcon,
  energy: EnergyIcon,
  ready: ReadyIcon,
  "no-go": NoGoIcon,
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: IconProps & { name: IconName }): ReactElement {
  const Component = ICONS[name];
  return <Component {...props} />;
}

export { IconBase as Svg };
