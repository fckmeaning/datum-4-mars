import { useEffect, useRef, useState, type ReactElement } from "react";
import { apiClient, type Place, type PointReport } from "../api/client";
import { useAppStore } from "../state/store";
import { BaseIcon, CheckIcon, CopyIcon, CrosshairIcon, DirectionsIcon, DownloadIcon, MountainIcon, PinIcon, RoverIcon, ScienceIcon, SlopeIcon, CompassIcon, RouteIcon, InfoIcon } from "../icons";
import { Button, Chip, EmptyState, KeyValue, KeyValueList, Panel, Skeleton, type ChipTone } from "../ui/Panel";
import { bearingMars, coordForClipboard, distanceMars, formatBearing, formatCoord, formatDistance, formatElevation, formatSlope, placeKindLabel } from "../ui/format";
import { downloadJson, placeToGeoJSON, safeFilename } from "./placeExport";
import "./PlaceCard.css";

interface PlaceCardProps {
  place: Place;
  onClose: () => void;
  onRouteFrom?: (place: Place) => void;
  onRouteTo?: (place: Place) => void;
  /** Distance and bearing are measured from here; defaults to Bradbury Landing (D-01). */
  base?: { lat: number; lon: number };
  /** Optional "Where am I?" action (position fix); hidden when not provided. */
  onWhereAmI?: () => void;
}

const DEFAULT_BASE = { lat: -4.5895, lon: 137.4417 };

function kindIcon(place: Place): ReactElement {
  if (place.kind === "base") return <BaseIcon size={20} />;
  if (place.science_target) return <ScienceIcon size={20} />;
  if (place.kind === "mission_informal") return <RoverIcon size={20} />;
  return <PinIcon size={20} />;
}

function kindTone(place: Place): ChipTone {
  if (place.kind === "base") return "accent";
  if (place.science_target) return "info";
  return "neutral";
}

type Terrain = { status: "loading" } | { status: "ready"; report: PointReport } | { status: "error" };

export function PlaceCard({ place, onClose, onRouteFrom, onRouteTo, base = DEFAULT_BASE, onWhereAmI }: PlaceCardProps) {
  const siteId = useAppStore((s) => s.siteId);
  const utc = useAppStore((s) => s.utc);
  const waypoints = useAppStore((s) => s.waypoints);
  const setWaypoints = useAppStore((s) => s.setWaypoints);
  const setDirectionsOpen = useAppStore((s) => s.setDirectionsOpen);

  const [terrain, setTerrain] = useState<Terrain>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    setTerrain({ status: "loading" });
    apiClient
      .whatsHere(siteId, place.lat, place.lon, utc)
      .then((report) => {
        if (active) setTerrain({ status: "ready", report });
      })
      .catch(() => {
        if (active) setTerrain({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [siteId, place.id, place.lat, place.lon, utc]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const handleRouteFrom = () => {
    if (onRouteFrom) {
      onRouteFrom(place);
    } else {
      const updated = [...waypoints];
      updated[0] = { role: "start", dwell_min: 0, place_id: place.id, lat: place.lat, lon: place.lon };
      setWaypoints(updated);
      setDirectionsOpen(true);
      onClose();
    }
  };

  const handleRouteTo = () => {
    if (onRouteTo) {
      onRouteTo(place);
    } else {
      const updated = [...waypoints];
      const lastIndex = Math.max(1, updated.length - 1);
      updated[lastIndex] = { role: "goal", dwell_min: 0, place_id: place.id, lat: place.lat, lon: place.lon };
      setWaypoints(updated);
      setDirectionsOpen(true);
      onClose();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coordForClipboard(place.lat, place.lon));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleExport = () => {
    const elevation = terrain.status === "ready" ? terrain.report.elevation_m : null;
    downloadJson(`${safeFilename(place.name)}.geojson`, placeToGeoJSON(place, elevation));
  };

  const isBase = place.kind === "base";
  const distance = distanceMars(base.lat, base.lon, place.lat, place.lon);
  const bearing = bearingMars(base.lat, base.lon, place.lat, place.lon);
  const simulated = new Set(terrain.status === "ready" ? (terrain.report.simulated_fields ?? []) : []);
  const simChip = (key: string) => (simulated.has(key) ? <Chip tone="warning" title="Simulated input">SIM</Chip> : undefined);

  return (
    <Panel
      label={`Place details: ${place.name}`}
      className="place-card"
      icon={kindIcon(place)}
      title={place.name}
      subtitle={
        <span className="place-card__sub">
          <Chip tone={kindTone(place)}>{placeKindLabel(place.kind, place.science_target)}</Chip>
          <span className="place-card__source" title={place.source}>
            {place.source}
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <div className="place-card__actions">
          <Button variant="primary" icon={<DirectionsIcon size={16} />} onClick={handleRouteTo}>
            Directions
          </Button>
          <Button variant="secondary" icon={<RouteIcon size={16} />} onClick={handleRouteFrom}>
            From here
          </Button>
          {onWhereAmI ? (
            <Button variant="ghost" icon={<CrosshairIcon size={16} />} onClick={onWhereAmI}>
              Where am I?
            </Button>
          ) : null}
          <Button variant="ghost" icon={<DownloadIcon size={16} />} onClick={handleExport}>
            Export
          </Button>
        </div>
      }
    >
      {place.pov_image?.url ? (
        <figure className="place-card__figure">
          <img src={place.pov_image.url} alt={`${place.name} as seen by the rover`} loading="lazy" />
          <figcaption>
            {[place.pov_image.camera, place.pov_image.sol != null ? `sol ${place.pov_image.sol}` : null, place.pov_image.position_quality === "approximate" ? "approximate position" : null]
              .filter(Boolean)
              .join(" · ")}
            <span className="place-card__credit"> {place.pov_image.credit}</span>
          </figcaption>
        </figure>
      ) : null}

      <div className="place-card__coord">
        <span className="place-card__coord-text u-num" aria-label="Coordinates">
          {formatCoord(place.lat, place.lon)}
        </span>
        <button type="button" className="place-card__copy" onClick={handleCopy} aria-label={copied ? "Coordinates copied" : "Copy coordinates"} title="Copy coordinates (lat, lon)">
          {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {place.description ? <p className="place-card__desc">{place.description}</p> : null}

      <KeyValueList label="Place measurements">
        <KeyValue icon={<MountainIcon size={16} />} label="Elevation" value={terrain.status === "loading" ? <Skeleton width={64} /> : terrain.status === "ready" ? formatElevation(terrain.report.elevation_m) : "—"} chip={terrain.status === "ready" ? simChip("elevation_m") : undefined} />
        <KeyValue icon={<SlopeIcon size={16} />} label="Slope" value={terrain.status === "loading" ? <Skeleton width={48} /> : terrain.status === "ready" ? formatSlope(terrain.report.slope_deg) : "—"} chip={terrain.status === "ready" ? simChip("slope_deg") : undefined} />
        <KeyValue
          icon={<InfoIcon size={16} />}
          label="Geology"
          value={<span className="place-card__muted">Not mapped yet</span>}
          hint="No geologic-unit layer is loaded for this site yet"
        />
        {!isBase ? <KeyValue icon={<RouteIcon size={16} />} label="From base" value={formatDistance(distance)} hint="Straight-line distance on the Mars sphere" /> : null}
        {!isBase ? <KeyValue icon={<CompassIcon size={16} />} label="Bearing" value={formatBearing(bearing)} hint="Initial bearing from the base, clockwise from north" /> : null}
      </KeyValueList>

      {terrain.status === "error" ? (
        <EmptyState tone="danger" icon={<InfoIcon size={22} />} title="Terrain values unavailable" text="The elevation and slope service did not answer. Coordinates and distances above are still correct." />
      ) : null}
    </Panel>
  );
}
