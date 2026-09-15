import { isZone, nextZone, ZONES, zoneIndex } from "../src/lib/zone-nav.js";
import { describe, expect, it } from "vitest";

describe("zone-nav", () => {
  it("lists three zones in order", () => {
    expect([...ZONES]).toEqual(["library", "reader", "paper"]);
  });

  it("validates zone names", () => {
    expect(isZone("reader")).toBe(true);
    expect(isZone("nope")).toBe(false);
  });

  it("cycles forward with wraparound", () => {
    expect(nextZone("library")).toBe("reader");
    expect(nextZone("paper")).toBe("library");
  });

  it("indexes zones", () => {
    expect(zoneIndex("paper")).toBe(2);
  });
});
