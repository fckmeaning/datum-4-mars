import { useMemo, useState, type ReactElement } from "react";
import type { Place } from "../api/client";
import { BaseIcon, PinIcon, PlanetIcon, RoverIcon, ScienceIcon, SearchIcon } from "../icons";
import { EmptyState, Panel, PanelSection } from "../ui/Panel";
import { distanceMars, formatDistance } from "../ui/format";
import { useAppStore } from "../state/store";
import "./PoiMenu.css";

interface PoiMenuProps {
  places: Place[];
  basePlace?: Place;
  onSelectPlace: (place: Place) => void;
  onClose: () => void;
}

type GroupKey = "base" | "science" | "mission_informal" | "gazetteer";

const GROUPS: { key: GroupKey; label: string; icon: ReactElement }[] = [
  { key: "base", label: "Base and habitat", icon: <BaseIcon size={16} /> },
  { key: "science", label: "Science targets", icon: <ScienceIcon size={16} /> },
  { key: "mission_informal", label: "Curiosity traverse", icon: <RoverIcon size={16} /> },
  { key: "gazetteer", label: "Landmarks", icon: <PlanetIcon size={16} /> },
];

function groupOf(p: Place): GroupKey {
  if (p.kind === "base") return "base";
  if (p.science_target) return "science";
  if (p.kind === "mission_informal") return "mission_informal";
  return "gazetteer";
}

export function PoiMenu({ places, basePlace, onSelectPlace, onClose }: PoiMenuProps) {
  const triggerFlyTo = useAppStore((s) => s.triggerFlyTo);
  const selectedPlaceId = useAppStore((s) => s.selectedPlaceId);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);
  const [filter, setFilter] = useState("");

  const baseLat = basePlace?.lat ?? -4.5895;
  const baseLon = basePlace?.lon ?? 137.4417;

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const groups: Record<GroupKey, (Place & { distFromBaseM: number })[]> = { base: [], science: [], mission_informal: [], gazetteer: [] };
    for (const p of places) {
      if (q && !`${p.name} ${p.description ?? ""} ${(p.aliases ?? []).join(" ")}`.toLowerCase().includes(q)) continue;
      groups[groupOf(p)].push({ ...p, distFromBaseM: distanceMars(baseLat, baseLon, p.lat, p.lon) });
    }
    for (const g of GROUPS) groups[g.key].sort((a, b) => a.distFromBaseM - b.distFromBaseM);
    return groups;
  }, [places, filter, baseLat, baseLon]);

  const total = GROUPS.reduce((n, g) => n + grouped[g.key].length, 0);

  const handleItemClick = (place: Place) => {
    triggerFlyTo({ lat: place.lat, lon: place.lon }, 14);
    setSelectedPlaceId(place.id);
    onSelectPlace(place);
  };

  return (
    <Panel
      label="Points of interest"
      className="poi"
      icon={<PinIcon size={20} />}
      title="Points of interest"
      subtitle={`${places.length} places, nearest to the base first`}
      onClose={onClose}
    >
      <label className="poi__filter">
        <SearchIcon size={16} />
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter places" aria-label="Filter places" autoComplete="off" spellCheck={false} />
      </label>

      {total === 0 ? (
        <EmptyState icon={<PinIcon size={22} />} title={places.length === 0 ? "No places loaded" : "Nothing matches"} text={places.length === 0 ? "The place list could not be loaded for this site." : "Try a shorter name, or clear the filter."} />
      ) : (
        GROUPS.map(({ key, label, icon }) => {
          const items = grouped[key];
          if (items.length === 0) return null;
          return (
            <PanelSection key={key} title={<span className="poi__group-title">{icon}{label}</span>} aside={items.length}>
              <ul className="poi__list">
                {items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className={`poi__item${selectedPlaceId === item.id ? " poi__item--active" : ""}`} onClick={() => handleItemClick(item)} aria-current={selectedPlaceId === item.id || undefined}>
                      <span className="poi__item-text">
                        <span className="poi__item-name">{item.name}</span>
                        {item.description ? <span className="poi__item-desc">{item.description}</span> : null}
                      </span>
                      <span className="poi__item-dist u-num">{key === "base" ? "Base" : formatDistance(item.distFromBaseM)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </PanelSection>
          );
        })
      )}
    </Panel>
  );
}
