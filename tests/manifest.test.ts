import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface Manifest {
  host_permissions: string[];
}

describe("manifest permissions", () => {
  it("requests only X and the local API host", async () => {
    const manifest = JSON.parse(await readFile(new URL("../src/manifest.json", import.meta.url), "utf8")) as Manifest;

    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*", "https://x.com/*"]);
    expect(manifest.host_permissions.some((permission) => permission.startsWith("http://") && !permission.startsWith("http://127.0.0.1/"))).toBe(false);
  });
});
