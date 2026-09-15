import { clearOperations, registerOperation, resolveOperation } from "../src/lib/op-registry.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("op-registry", () => {
  beforeEach(() => clearOperations());

  it("registers and resolves the Bookmarks operation", () => {
    registerOperation({ kind: "query", operationName: "Bookmarks", queryId: "tF6KOjmZM0WGcB2Q0mfwhw" });
    expect(resolveOperation("Bookmarks")?.queryId).toBe("tF6KOjmZM0WGcB2Q0mfwhw");
  });

  it("rejects duplicate registration", () => {
    registerOperation({ kind: "query", operationName: "Bookmarks", queryId: "aaa" });
    expect(() => registerOperation({ kind: "query", operationName: "Bookmarks", queryId: "bbb" })).toThrow(
      /already registered/,
    );
  });

  it("returns undefined for unknown operations", () => {
    expect(resolveOperation("Nope")).toBeUndefined();
  });
});
