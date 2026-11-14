import { afterEach, describe, expect, it, vi } from "vitest";
import { VIEW_STORAGE_KEY, initialView, isViewMode, otherView, readStoredView, storeView } from "./viewMode";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("view mode persistence", () => {
  it("the key is d4-view", () => {
    expect(VIEW_STORAGE_KEY).toBe("d4-view");
  });

  it("validates and flips", () => {
    expect(isViewMode("flat")).toBe(true);
    expect(isViewMode("globe")).toBe(true);
    expect(isViewMode("map")).toBe(false);
    expect(otherView("globe")).toBe("flat");
    expect(otherView("flat")).toBe("globe");
  });

  it("remembers the last choice", () => {
    expect(readStoredView()).toBeNull();
    storeView("flat");
    expect(window.localStorage.getItem("d4-view")).toBe("flat");
    expect(readStoredView()).toBe("flat");
  });

  it("ignores garbage in storage", () => {
    window.localStorage.setItem("d4-view", "sideways");
    expect(readStoredView()).toBeNull();
    expect(initialView("")).toBe("globe");
  });

  it("opens on the globe by default, on the remembered view otherwise, and ?view= wins", () => {
    expect(initialView("")).toBe("globe");
    storeView("flat");
    expect(initialView("")).toBe("flat");
    expect(initialView("?view=globe")).toBe("globe");
    window.localStorage.setItem("d4-view", "globe");
    expect(initialView("?view=flat")).toBe("flat");
    expect(initialView("?site=gale&view=flat&autopilot")).toBe("flat");
    expect(initialView("?view=nonsense")).toBe("globe");
  });

  it("survives a localStorage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredView()).toBeNull();
    expect(() => storeView("flat")).not.toThrow();
    expect(initialView("")).toBe("globe");
    expect(initialView("?view=flat")).toBe("flat");
  });
});
