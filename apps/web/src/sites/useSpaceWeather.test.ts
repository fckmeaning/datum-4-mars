import { describe, it, expect } from "vitest";
import { pickAlert, type Alert } from "./useSpaceWeather";

const a = (id: string, start: string, kind = "CME"): Alert => ({ id, kind, start, message: id, source: "DONKI" });
const now = new Date("2026-11-14T12:00:00Z");

describe("pickAlert", () => {
  it("takes the nearest CME inside the window", () => {
    const list = [a("old", "2026-10-27T12:00:00Z"), a("soon", "2026-11-15T00:00:00Z"), a("later", "2026-11-16T12:00:00Z")];
    expect(pickAlert(list, now)!.id).toBe("soon");
  });
  it("includes one that arrived in the last day and ignores far ones and other kinds", () => {
    expect(pickAlert([a("recent", "2026-11-13T18:00:00Z")], now)!.id).toBe("recent");
    expect(pickAlert([a("far", "2026-11-20T00:00:00Z"), a("flare", "2026-11-14T13:00:00Z", "FLR")], now)).toBeNull();
  });
});
