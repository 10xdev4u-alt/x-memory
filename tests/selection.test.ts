import { Selection } from "../src/lib/selection.js";
import { describe, expect, it } from "vitest";

describe("selection", () => {
  it("adds, removes, and toggles", () => {
    const selection = new Selection();
    expect(selection.size).toBe(0);
    selection.add("a");
    selection.add("a");
    expect(selection.size).toBe(1);
    expect(selection.toggle("a")).toBe(false);
    expect(selection.has("a")).toBe(false);
    expect(selection.toggle("b")).toBe(true);
    expect(selection.list()).toEqual(["b"]);
  });

  it("clears everything", () => {
    const selection = new Selection();
    selection.add("a");
    selection.add("b");
    selection.clear();
    expect(selection.size).toBe(0);
    expect(selection.list()).toEqual([]);
  });
});
