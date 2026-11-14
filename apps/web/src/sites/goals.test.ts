import { describe, it, expect } from "vitest";
import { JEZERO_GOALS, galeGoals, goalsFor, type GalePlace } from "./goals";
import { fetchMslPhotos, pickMastcam, staticPhoto, type RawItem } from "./photos";

const place = (id: string, name: string, lat: number, lon: number, sols: [number, number]): GalePlace => ({ id, name, lat, lon, sols, description: `${name} text` });
const PLACES: GalePlace[] = [
  place("gale.yellowknife_bay", "Yellowknife Bay", -4.74, 137.45, [125, 299]),
  place("gale.pahrump_hills", "Pahrump Hills", -4.77, 137.37, [750, 950]),
  place("gale.dingo_gap", "Dingo Gap", -4.64, 137.4, [530, 545]),
];

describe("Gale goals", () => {
  it("keep only the goals whose places exist and give every stop its position and sols", () => {
    const g = galeGoals(PLACES);
    expect(g.goals.map((x) => x.id)).toEqual(["lake", "wind", "grand"]);
    const lake = g.goals.find((x) => x.id === "lake")!;
    expect(lake.stops).toEqual(["gale.yellowknife_bay", "gale.pahrump_hills"]);
    for (const goal of g.goals) for (const id of goal.stops) expect(g.stops.some((s) => s.id === id)).toBe(true);
    expect(g.stops.find((s) => s.id === "gale.dingo_gap")!.sols).toEqual([530, 545]);
  });
  it("a goal with no stop left is dropped", () => {
    expect(galeGoals([]).goals).toHaveLength(0);
  });
});

describe("Jezero goals", () => {
  it("every goal stop exists and lies inside the 6 km HiRISE tile", () => {
    const west = 77.39, east = 77.4967, south = 18.3934, north = 18.4946;
    for (const g of JEZERO_GOALS.goals) {
      for (const id of g.stops) {
        const s = JEZERO_GOALS.stops.find((x) => x.id === id)!;
        expect(s).toBeDefined();
        expect(s.lon).toBeGreaterThan(west);
        expect(s.lon).toBeLessThan(east);
        expect(s.lat).toBeGreaterThan(south);
        expect(s.lat).toBeLessThan(north);
      }
    }
  });
  it("only Gale and Jezero have goals", () => {
    expect(goalsFor("jezero", null)).toBe(JEZERO_GOALS);
    expect(goalsFor("gale", null)).toBeNull();
    expect(goalsFor("gale", PLACES)!.goals.length).toBeGreaterThan(0);
    expect(goalsFor("gusev", PLACES)).toBeNull();
  });
});

describe("photos", () => {
  const items: RawItem[] = Array.from({ length: 20 }, (_, k) => ({
    https_url: `https://mars.nasa.gov/msl-raw-images/msss/04650/mcam/${k}.jpg`,
    title: `Sol 4650: Mast Camera (Mastcam) ${k}`,
    sol: 4650,
    instrument: k % 2 ? "MAST_LEFT" : "MAST_RIGHT",
    imageid: `4650ML${String(k).padStart(4, "0")}`,
    is_thumbnail: k === 3,
  }));
  items.push({ https_url: "https://x/nav.jpg", sol: 4650, instrument: "NAV_LEFT", imageid: "a" });
  it("picks Mastcam frames only, no thumbnails, spread through the sol", () => {
    const p = pickMastcam(items, 6);
    expect(p).toHaveLength(6);
    expect(p.every((x) => x.src.includes("mcam"))).toBe(true);
    expect(p.some((x) => x.src.endsWith("/3.jpg"))).toBe(false);
    expect(new Set(p.map((x) => x.src)).size).toBe(6);
    expect(p[0]!.credit).toBe("NASA/JPL-Caltech/MSSS");
  });
  it("returns nothing when there is no Mastcam image", () => {
    expect(pickMastcam([{ https_url: "https://x/nav.jpg", instrument: "NAV_LEFT" }])).toEqual([]);
  });
  it("builds the bundled photo path", () => {
    const p = staticPhoto("jezero", { file: "photos/depot.jpg", camera: "Mastcam-Z", sol: 690, date: "28 Jan 2023", credit: "NASA/JPL-Caltech/ASU" });
    expect(p.src).toBe("/data/sites/jezero/photos/depot.jpg");
    expect(p.title).toContain("sol 690");
  });
  it("widens the sol window when the first has too few Mastcam images", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({ items: calls.length < 2 ? [] : items }) };
    }) as unknown as typeof fetch;
    const p = await fetchMslPhotos(4650, 4, fake);
    expect(p).toHaveLength(4);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("4642:sol:gte");
    expect(calls[0]).toContain("4658:sol:lte");
    expect(calls[1]).toContain("4610:sol:gte");
    expect(calls[1]).toContain("4690:sol:lte");
  });
  it("gives up with no photos when even the wide window is empty", async () => {
    const fake = (async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })) as unknown as typeof fetch;
    expect(await fetchMslPhotos(850, 4, fake)).toEqual([]);
  });
  it("reports a failing feed", async () => {
    const fake = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(fetchMslPhotos(10, 3, fake)).rejects.toThrow(/503/);
  });
});
