import { packageName } from "../src/lib/release.js";
import { describe, expect, it } from "vitest";

describe("package", () => {
  it("names stable and beta artifacts", () => {
    expect(packageName("1.0.0", "stable")).toBe("x-memory-1.0.0.zip");
    expect(packageName("1.0.0", "beta")).toBe("x-memory-1.0.0-beta.zip");
  });
});
