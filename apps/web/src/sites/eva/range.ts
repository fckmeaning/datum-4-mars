/** The range ring of a dropped pin: how far one can walk on from the pin and still get back to the station on the usable oxygen. */

import { cellOf, homeField, outField, type Grid, type Pt } from "./grid";
import { usableO2 } from "./plan";

export interface RangeRing {
  /** closed outline in local metres (x east, y north from the middle of the tile) */
  ring: Pt[];
  /** oxygen to walk station -> pin [L] */
  toPinL: number;
  /** oxygen left for the loop pin -> anywhere -> station [L] */
  budgetL: number;
  /** longest distance from the pin to the outline [m] */
  maxRadiusM: number;
  /** false when the pin itself cannot be reached and walked home from within the budget */
  reachable: boolean;
}

/**
 * A cell is inside the ring when  O2(station -> pin) + O2(pin -> cell) + O2(cell -> station) <= usable oxygen.
 * Each term is the cheapest walk on the elevation model (the same Minetti cost the planner uses), so the ring
 * stretches along gentle ground and shrinks against steep slopes. The outline is cut along rays from the pin.
 */
export function rangeRing(g: Grid, station: Pt, pin: Pt, rays = 72, capacityL?: number): RangeRing {
  const stationCell = cellOf(g, station);
  const pinCell = cellOf(g, pin);
  const usable = usableO2(capacityL);
  const fromStation = outField(g, stationCell);
  const toPinL = fromStation[pinCell]!;
  const budgetL = usable - toPinL;
  const empty: RangeRing = { ring: [], toPinL, budgetL, maxRadiusM: 0, reachable: false };
  if (!Number.isFinite(toPinL) || budgetL <= 0) return empty;

  const fromPin = outField(g, pinCell);
  const home = homeField(g, stationCell);
  const inside = (cell: number) => fromPin[cell]! + home[cell]! <= budgetL;
  if (!inside(pinCell)) return empty;

  const stepM = Math.min(g.cellX, g.cellY) * 0.5;
  const maxM = Math.hypot(g.w * g.cellX, g.h * g.cellY);
  const ring: Pt[] = [];
  let maxRadiusM = 0;
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    let last = 0;
    for (let d = stepM; d <= maxM; d += stepM) {
      const x = pin.x + ux * d;
      const y = pin.y + uy * d;
      if (Math.abs(x) > (g.w * g.cellX) / 2 || Math.abs(y) > (g.h * g.cellY) / 2) break; // the tile ends
      if (!inside(cellOf(g, { x, y }))) break;
      last = d;
    }
    ring.push({ x: pin.x + ux * last, y: pin.y + uy * last });
    maxRadiusM = Math.max(maxRadiusM, last);
  }
  return { ring, toPinL, budgetL, maxRadiusM, reachable: true };
}
