// USGS SIM 3292, Geologic Map of Mars (Tanaka et al. 2014, 1:20,000,000), USGS-NASA Planetary Geologic
// Mapping Program. Unit symbols and colours come from the map's own files (data/processed/globe/mars_geo_units.json).
//
// Names follow the map's convention: an optional e/m/l (Early/Middle/Late), the period letters
// (A Amazonian, H Hesperian, N Noachian), then the unit group. Ages are the epoch boundaries in billions of years (Ga).

export interface UnitInfo {
  sym: string;
  name: string;
  age: string;
  group: string;
  text: string;
}

const PERIOD: Record<string, string> = { A: "Amazonian", H: "Hesperian", N: "Noachian" };
const SUB: Record<string, string> = { e: "Early", m: "Middle", l: "Late" };

const GROUP: Record<string, [string, string]> = {
  h: ["highland", "highland"],
  hm: ["highland massif", "highland"],
  hu: ["highland undivided", "highland"],
  he: ["highland edifice", "highland"],
  v: ["volcanic", "volcanic"],
  vf: ["volcanic field", "volcanic"],
  ve: ["volcanic edifice", "volcanic"],
  b: ["basin", "basin"],
  l: ["lowland", "lowland"],
  a: ["apron", "apron"],
  i: ["impact", "impact"],
  t: ["transition", "transition"],
  tu: ["transition undivided", "transition"],
  to: ["transition outflow", "transition"],
  p: ["polar", "polar"],
  pu: ["polar undivided", "polar"],
  pe: ["polar edifice", "polar"],
  pc: ["polar cap", "polar"],
  pd: ["polar dunes", "polar"],
};

const GROUP_TEXT: Record<string, string> = {
  highland: "Densely cratered old crust: a mix of impact, sedimentary and volcanic rocks.",
  volcanic: "Lava flows and volcanic deposits, most likely basalt.",
  basin: "Low-lying plains on the floors of the giant impact basins.",
  lowland: "Sediments spread across the northern lowlands, likely mixed with lava.",
  apron: "Lobes of material that flowed or slid downslope.",
  impact: "Ejecta and rims of large, well-preserved impact craters.",
  transition: "Plains, knobs and mesas where the highlands step down to the lowlands.",
  polar: "Mostly ice, dust and other fines at the poles.",
};

/** Lower boundary of each epoch (Ga); the younger end is the next epoch's start. */
const START: Record<string, number | null> = {
  eN: null,
  mN: 3.96,
  lN: 3.85,
  eH: 3.56,
  lH: 3.39,
  eA: 3.24,
  mA: 1.03,
  lA: 0.274,
};
const ORDER = ["eN", "mN", "lN", "eH", "lH", "eA", "mA", "lA"];

function ageText(sub: string, periods: string[]): string {
  const eps = periods.flatMap((p) =>
    sub ? [sub + p] : ["e" + p, "m" + p, "l" + p].filter((x) => x in START),
  );
  const idx = eps
    .map((e) => ORDER.indexOf(e))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (idx.length === 0) return "";
  const oldest = ORDER[idx[0]!]!;
  const youngest = ORDER[idx[idx.length - 1]!]!;
  const from = START[oldest];
  const next = ORDER[ORDER.indexOf(youngest) + 1];
  const to = next ? (START[next] ?? 0) : 0;
  if (from == null) return to === 0 ? "Noachian to recent" : `more than ${to} billion years old`;
  if (to === 0) return `${from} billion years ago to recent`;
  return `${from}–${to} billion years ago`;
}

/** Per-unit notes for Gale and its surroundings (from the map's Description of Map Units). */
const UNIT_TEXT: Record<string, string> = {
  HNt: "Knobs, mesas and plains on the highland edge: ancient impact breccias, sediments and volcanic rocks, with aprons of material shed from slopes.",
  eHv: "Flood lavas from fissures and vents.",
};

/** Describes a unit symbol such as "HNt" or "mNhm". Unknown symbols come back with empty text. */
export function describeUnit(sym: string): UnitInfo {
  const m = /^([eml]?)([AHN]+)([a-z]+)$/.exec(sym);
  if (!m) return { sym, name: sym, age: "", group: "", text: "" };
  const sub = m[1] ?? "";
  const per = m[2] ?? "";
  const grp = m[3] ?? "";
  const [gname, gkey] = GROUP[grp] ?? [grp, ""];
  const periods = per.split("");
  const name = `${sub ? SUB[sub] + " " : ""}${periods.map((p) => PERIOD[p]).join(" and ")} ${gname} unit`;
  return { sym, name, age: ageText(sub, periods), group: gkey, text: UNIT_TEXT[sym] ?? GROUP_TEXT[gkey] ?? "" };
}
